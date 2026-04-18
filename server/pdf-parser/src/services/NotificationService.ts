import prisma from "../prisma";
import { logger } from "../utils/logger";

export type InsertNotificationParams = {
  companyId: number | null;
  recipientEmployeeId: number;
  documentId: number | null;
  eventType: string;
  title: string;
  body?: string | null;
  payload?: unknown;
};

export async function ensureNotificationTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_notifications (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT NULL,
      recipient_employee_id INT NOT NULL,
      document_id INT NULL,
      event_type VARCHAR(64) NOT NULL,
      title VARCHAR(512) NOT NULL,
      body TEXT NULL,
      payload_json JSON NULL,
      read_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_approval_notifications_recipient (recipient_employee_id),
      INDEX idx_approval_notifications_company (company_id),
      INDEX idx_approval_notifications_unread (recipient_employee_id, read_at),
      INDEX idx_approval_notifications_created (created_at)
    )
  `);
}

/**
 * Вставка уведомления. Ошибки логируются и не пробрасываются — доменные операции не должны падать из‑за ленты.
 */
export async function insertNotification(params: InsertNotificationParams): Promise<void> {
  try {
    await ensureNotificationTables();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO approval_notifications (
          company_id, recipient_employee_id, document_id, event_type, title, body, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      params.companyId,
      params.recipientEmployeeId,
      params.documentId,
      params.eventType,
      params.title,
      params.body ?? null,
      params.payload === undefined ? null : JSON.stringify(params.payload)
    );
  } catch (error) {
    logger.error(`❌ Не удалось записать уведомление: ${error}`);
  }
}

export async function getDocumentTitleLine(documentId: number): Promise<string> {
  await ensureNotificationTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ type: string; number_value: string }>>(
    `SELECT type, number_value FROM approval_documents WHERE id = ? LIMIT 1`,
    documentId
  );
  const row = rows[0];
  if (!row) return `Документ #${documentId}`;
  return `${row.type} №${row.number_value}`;
}

export async function getFirstPendingAssigneeId(documentId: number): Promise<number | null> {
  await ensureNotificationTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ assignee_user_id: number }>>(
    `
      SELECT assignee_user_id
      FROM approval_tasks
      WHERE document_id = ? AND status = 'pending'
      ORDER BY step_order ASC
      LIMIT 1
    `,
    documentId
  );
  return rows[0]?.assignee_user_id ?? null;
}

export async function getPendingAssigneeIds(documentId: number): Promise<number[]> {
  await ensureNotificationTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ assignee_user_id: number }>>(
    `
      SELECT DISTINCT assignee_user_id
      FROM approval_tasks
      WHERE document_id = ? AND status IN ('pending', 'blocked')
    `,
    documentId
  );
  return rows.map((r) => r.assignee_user_id);
}
