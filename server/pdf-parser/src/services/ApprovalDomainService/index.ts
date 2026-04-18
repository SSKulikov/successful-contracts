import prisma from "../../prisma";

/**
 * Контракт таблиц домена согласований (ensure-идемпотентная схема).
 *
 * approval_routes
 *   id, company_id, name, is_default (0|1), created_at, updated_at
 *
 * approval_route_steps
 *   id, route_id → approval_routes, step_order (UNIQUE в пределах route),
 *   assignee_kind: "employee" | "role_default",
 *   assignee_employee_id (NOT NULL при kind=employee),
 *   role_key (NOT NULL при kind=role_default, значение из roles_json, напр. "admin"),
 *   default_employee_id (fallback-исполнитель при kind=role_default)
 *
 * approval_documents
 *   …существующие поля…, route_id → approval_routes (NULL до submit)
 *
 * approval_tasks
 *   …существующие поля…, route_id → approval_routes (FK, ON DELETE SET NULL)
 */

export type ApprovalDocumentStatus = "uploaded" | "in_approval" | "revision" | "rejected" | "approved";

export type ApprovalDocumentAccessRow = {
  id: number;
  company_id: number | null;
  created_by: number;
  last_edited_by: number;
  status: ApprovalDocumentStatus;
  route_id: number | null;
};

export type AssigneeKind = "employee" | "role_default";

export type ApprovalRouteRow = {
  id: number;
  company_id: number;
  name: string;
  is_default: 0 | 1;
  /** Тип документа из справочника; NULL — маршрут для любого типа. */
  document_type?: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ApprovalRouteStepRow = {
  id: number;
  route_id: number;
  step_order: number;
  assignee_kind: AssigneeKind;
  assignee_employee_id: number | null;
  role_key: string | null;
  default_employee_id: number | null;
};

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) AND LOWER(COLUMN_NAME) = LOWER(?)`,
    table,
    column
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function constraintExists(table: string, constraint: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    table, constraint
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table, index
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

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

  // --- Маршруты согласования ---

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_routes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      is_default TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_approval_routes_company_id (company_id)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_route_steps (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      route_id INT NOT NULL,
      step_order INT NOT NULL,
      assignee_kind VARCHAR(32) NOT NULL,
      assignee_employee_id INT NULL,
      role_key VARCHAR(64) NULL,
      default_employee_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_approval_route_steps_route_id (route_id),
      UNIQUE INDEX uq_approval_route_steps_route_order (route_id, step_order),
      CONSTRAINT fk_approval_route_steps_route_id FOREIGN KEY (route_id) REFERENCES approval_routes(id) ON DELETE CASCADE
    )
  `);

  // --- Инкрементальные ALTER: колонка route_id в approval_documents + FK ---

  if (!(await columnExists("approval_documents", "route_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE approval_documents ADD COLUMN route_id INT NULL AFTER status`
    );
  }

  if (!(await indexExists("approval_documents", "idx_approval_documents_route_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE approval_documents ADD INDEX idx_approval_documents_route_id (route_id)`
    );
  }

  if (!(await constraintExists("approval_documents", "fk_approval_documents_route_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE approval_documents ADD CONSTRAINT fk_approval_documents_route_id
       FOREIGN KEY (route_id) REFERENCES approval_routes(id) ON DELETE SET NULL`
    );
  }

  // FK approval_tasks.route_id → approval_routes (колонка уже есть, FK ещё нет)

  if (!(await constraintExists("approval_tasks", "fk_approval_tasks_route_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE approval_tasks ADD CONSTRAINT fk_approval_tasks_route_id
       FOREIGN KEY (route_id) REFERENCES approval_routes(id) ON DELETE SET NULL`
    );
  }

  if (!(await columnExists("approval_routes", "document_type"))) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE approval_routes ADD COLUMN document_type VARCHAR(64) NULL AFTER is_default`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("1060") && !msg.includes("Duplicate column name")) {
        throw error;
      }
    }
  }
}

export async function getApprovalDocumentAccessRow(documentId: number): Promise<ApprovalDocumentAccessRow | null> {
  const rows = await prisma.$queryRawUnsafe<ApprovalDocumentAccessRow[]>(
    `
      SELECT id, company_id, created_by, last_edited_by, status, route_id
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
      WHERE document_id = ? AND status IN (?, ?)
    `,
    "cancelled",
    documentId,
    "pending",
    "blocked"
  );
}

export async function createTasksFromRoute(documentId: number, routeId: number) {
  const steps = await prisma.$queryRawUnsafe<ApprovalRouteStepRow[]>(
    `
      SELECT id, route_id, step_order, assignee_kind, assignee_employee_id, role_key, default_employee_id
      FROM approval_route_steps
      WHERE route_id = ?
      ORDER BY step_order ASC
    `,
    routeId
  );

  if (!steps.length) {
    throw new Error("Маршрут не содержит шагов");
  }

  for (const step of steps) {
    const assigneeUserId = step.assignee_kind === "employee" ? step.assignee_employee_id : step.default_employee_id;
    if (!assigneeUserId) {
      throw new Error(`Шаг ${step.step_order} не содержит исполнителя`);
    }

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO approval_tasks (
          document_id, route_id, step_order, assignee_user_id, status, decision_comment
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      documentId,
      routeId,
      step.step_order,
      assigneeUserId,
      step.step_order === 1 ? "pending" : "blocked",
      null
    );
  }
}

/**
 * Одноразовый маршрут: только шаги «сотрудник» в заданном порядке (отправка с формы «Мои документы»).
 */
export async function createAdHocApprovalRoute(companyId: number, employeeIds: number[]): Promise<number> {
  if (!employeeIds.length) {
    throw new Error("Цепочка согласования пуста");
  }

  const placeholders = employeeIds.map(() => "?").join(",");
  const validRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `
      SELECT id
      FROM employees
      WHERE company_id = ?
        AND deleted_at IS NULL
        AND status = 'Активен'
        AND id IN (${placeholders})
    `,
    companyId,
    ...employeeIds
  );
  const valid = new Set(validRows.map((r) => r.id));
  for (const id of employeeIds) {
    if (!valid.has(id)) {
      throw new Error(`Сотрудник id=${id} недоступен для согласования в этой компании`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const routeName = `Согласование (${employeeIds.length} шаг.)`;
    await tx.$executeRawUnsafe(
      `INSERT INTO approval_routes (company_id, name, is_default, document_type) VALUES (?, ?, 0, NULL)`,
      companyId,
      routeName
    );
    const idRows = await tx.$queryRawUnsafe<Array<{ id: number }>>(`SELECT LAST_INSERT_ID() AS id`);
    const routeId = Number(idRows[0]?.id);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      throw new Error("Не удалось создать маршрут согласования");
    }

    let stepOrder = 1;
    for (const assigneeId of employeeIds) {
      await tx.$executeRawUnsafe(
        `
          INSERT INTO approval_route_steps
            (route_id, step_order, assignee_kind, assignee_employee_id, role_key, default_employee_id)
          VALUES (?, ?, 'employee', ?, NULL, NULL)
        `,
        routeId,
        stepOrder,
        assigneeId
      );
      stepOrder += 1;
    }

    return routeId;
  });
}

export async function activateNextRouteTask(documentId: number, currentStepOrder: number): Promise<boolean> {
  const nextRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `
      SELECT id
      FROM approval_tasks
      WHERE document_id = ?
        AND step_order > ?
        AND status = 'blocked'
      ORDER BY step_order ASC
      LIMIT 1
    `,
    documentId,
    currentStepOrder
  );

  const nextTaskId = nextRows[0]?.id;
  if (!nextTaskId) {
    return false;
  }

  await prisma.$executeRawUnsafe(
    `
      UPDATE approval_tasks
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    "pending",
    nextTaskId
  );

  return true;
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

