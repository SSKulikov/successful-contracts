import prisma from "../../prisma";

export type ApprovalDocumentStatus = "uploaded" | "in_approval" | "revision" | "rejected" | "approved";

export type ApprovalDocumentAccessRow = {
  id: number;
  company_id: number | null;
  created_by: number;
  last_edited_by: number;
  status: ApprovalDocumentStatus;
};

export async function ensureApprovalDomainTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_documents (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT NULL,
      type VARCHAR(64) NOT NULL,
      number_value VARCHAR(128) NOT NULL,
      date_value VARCHAR(64) NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      customer_inn VARCHAR(32) NOT NULL,
      executor_name VARCHAR(255) NOT NULL,
      executor_inn VARCHAR(32) NOT NULL,
      amount DECIMAL(18, 2) NOT NULL,
      subject TEXT NOT NULL,
      note TEXT NULL,
      status VARCHAR(32) NOT NULL,
      created_by INT NOT NULL,
      last_edited_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_approval_documents_company_id (company_id),
      INDEX idx_approval_documents_status (status),
      INDEX idx_approval_documents_created_by (created_by),
      INDEX idx_approval_documents_last_edited_by (last_edited_by),
      INDEX idx_approval_documents_created_at (created_at)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_document_events (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      document_id INT NOT NULL,
      actor_id INT NULL,
      event_type VARCHAR(64) NOT NULL,
      comment TEXT NULL,
      payload_json JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_approval_document_events_document_id (document_id),
      INDEX idx_approval_document_events_actor_id (actor_id),
      INDEX idx_approval_document_events_created_at (created_at),
      CONSTRAINT fk_approval_document_events_document_id FOREIGN KEY (document_id) REFERENCES approval_documents(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_tasks (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      document_id INT NOT NULL,
      route_id INT NULL,
      step_order INT NOT NULL,
      assignee_user_id INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      decision_comment TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_approval_tasks_document_id (document_id),
      INDEX idx_approval_tasks_assignee_user_id (assignee_user_id),
      INDEX idx_approval_tasks_status (status),
      INDEX idx_approval_tasks_created_at (created_at),
      CONSTRAINT fk_approval_tasks_document_id FOREIGN KEY (document_id) REFERENCES approval_documents(id) ON DELETE CASCADE
    )
  `);
}

export async function getApprovalDocumentAccessRow(documentId: number): Promise<ApprovalDocumentAccessRow | null> {
  const rows = await prisma.$queryRawUnsafe<ApprovalDocumentAccessRow[]>(
    `
      SELECT id, company_id, created_by, last_edited_by, status
      FROM approval_documents
      WHERE id = ?
      LIMIT 1
    `,
    documentId
  );

  return rows[0] ?? null;
}

export async function cancelPendingTasks(documentId: number) {
  await prisma.$executeRawUnsafe(
    `
      UPDATE approval_tasks
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE document_id = ? AND status = ?
    `,
    "cancelled",
    documentId,
    "pending"
  );
}

export async function createPendingTask(documentId: number, assigneeUserId: number, stepOrder = 1) {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO approval_tasks (
        document_id, route_id, step_order, assignee_user_id, status, decision_comment
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    documentId,
    null,
    stepOrder,
    assigneeUserId,
    "pending",
    null
  );
}

export async function addApprovalDocumentEvent(params: {
  documentId: number;
  actorId: number | null;
  eventType: string;
  comment?: string | null;
  payload?: unknown;
}) {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO approval_document_events (document_id, actor_id, event_type, comment, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `,
    params.documentId,
    params.actorId,
    params.eventType,
    params.comment ?? null,
    params.payload === undefined ? null : JSON.stringify(params.payload)
  );
}

