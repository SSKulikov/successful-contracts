import { Request, Response } from "express";
import prisma from "../prisma";
import { logger } from "../utils/logger";
import { getBearerToken, resolveEmployeeContextByToken } from "../utils/auth-context";
import { addApprovalDocumentEvent, ensureApprovalDomainTables } from "../services/ApprovalDomainService";
import { del, invalidateMyDocumentsListCaches } from "../cache/redis";

type DecisionAction = "approve" | "reject" | "revise";

function getDocumentCacheKey(companyId: number | null, documentId: number) {
  const companyPart = companyId === null ? "none" : String(companyId);
  return `doc:${companyPart}:${documentId}`;
}

function normalizeOptionalQueryString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function parsePaginationValue(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function listMyApprovals(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ message: "Отсутствует токен авторизации" });
      return;
    }

    const employee = await resolveEmployeeContextByToken(token);
    if (!employee) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

    const search = normalizeOptionalQueryString(req.query.q);
    const typeFilter = normalizeOptionalQueryString(req.query.type);
    const page = parsePaginationValue(req.query.page, 1, 10_000);
    const pageSize = parsePaginationValue(req.query.page_size, 10, 100);
    const offset = (page - 1) * pageSize;

    const whereConditions: string[] = [
      "t.assignee_user_id = ?",
      "t.status = 'pending'",
      "((? IS NULL AND d.company_id IS NULL) OR d.company_id = ?)"
    ];
    const whereValues: Array<number | string | null> = [employee.id, employee.companyId, employee.companyId];

    if (typeFilter) {
      whereConditions.push("d.type = ?");
      whereValues.push(typeFilter);
    }

    if (search) {
      whereConditions.push("(d.number_value LIKE ? OR d.customer_name LIKE ? OR d.executor_name LIKE ?)");
      whereValues.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `
        SELECT COUNT(*) AS total
        FROM approval_tasks t
        JOIN approval_documents d ON d.id = t.document_id
        ${whereClause}
      `,
      ...whereValues
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        task_id: number;
        document_id: number;
        type: string;
        number_value: string;
        customer_name: string;
        amount: string;
        created_at: Date;
        step_order: number;
        created_by: number;
        waiting_days: bigint;
      }>
    >(
      `
        SELECT
          t.id AS task_id,
          d.id AS document_id,
          d.type,
          d.number_value,
          d.customer_name,
          CAST(d.amount AS CHAR) AS amount,
          t.created_at,
          t.step_order,
          d.created_by,
          GREATEST(0, DATEDIFF(CURDATE(), DATE(t.created_at))) AS waiting_days
        FROM approval_tasks t
        JOIN approval_documents d ON d.id = t.document_id
        ${whereClause}
        ORDER BY t.created_at DESC
        LIMIT ?
        OFFSET ?
      `,
      ...whereValues,
      pageSize,
      offset
    );

    const items = rows.map((row) => ({
      key: String(row.task_id),
      id: String(row.task_id),
      type: row.type,
      title: `${row.type} №${row.number_value}`,
      initiator: row.customer_name,
      amount: row.amount,
      waitingDays: Number(row.waiting_days),
      currentStep: `Шаг ${row.step_order}`,
      receivedAt: row.created_at,
      priority: "Обычный",
      documentId: String(row.document_id),
      canTakeDecision: employee.role === "admin" || row.created_by !== employee.id
    }));

    res.json({
      items,
      meta: {
        page,
        pageSize,
        total
      }
    });
  } catch (error) {
    logger.error(`❌ Ошибка получения задач на согласование: ${error}`);
    res.status(500).json({ message: "Ошибка получения задач на согласование" });
  }
}

async function completeTaskDecision(req: Request, res: Response, action: DecisionAction): Promise<void> {
  await ensureApprovalDomainTables();

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Отсутствует токен авторизации" });
    return;
  }

  const employee = await resolveEmployeeContextByToken(token);
  if (!employee) {
    res.status(401).json({ message: "Сессия не найдена" });
    return;
  }

  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ message: "Некорректный id задачи" });
    return;
  }

  const decisionComment = String(req.body?.comment ?? "").trim();
  if (action === "revise" && !decisionComment) {
    res.status(400).json({ message: "Для отправки на доработку обязателен комментарий" });
    return;
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      task_id: number;
      document_id: number;
      assignee_user_id: number;
      task_status: string;
      step_order: number;
      document_status: string;
      company_id: number | null;
      created_by: number;
    }>
  >(
    `
      SELECT
        t.id AS task_id,
        t.document_id,
        t.assignee_user_id,
        t.status AS task_status,
        t.step_order,
        d.status AS document_status,
        d.company_id,
        d.created_by
      FROM approval_tasks t
      JOIN approval_documents d ON d.id = t.document_id
      WHERE t.id = ?
      LIMIT 1
    `,
    taskId
  );

  const task = rows[0];
  if (!task) {
    res.status(404).json({ message: "Задача не найдена" });
    return;
  }

  if (employee.companyId !== task.company_id) {
    res.status(403).json({ message: "Задача принадлежит другой компании" });
    return;
  }

  if (task.assignee_user_id !== employee.id) {
    res.status(403).json({ message: "Задача назначена другому сотруднику" });
    return;
  }

  if (task.task_status !== "pending") {
    res.status(409).json({ message: "Задача уже обработана" });
    return;
  }

  if (task.document_status !== "in_approval") {
    res.status(409).json({ message: "Документ не находится на согласовании" });
    return;
  }

  const taskNextStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revision_requested";
  const documentNextStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revision";
  const eventType = action === "approve" ? "task_approved" : action === "reject" ? "task_rejected" : "task_revise_requested";

  await prisma.$executeRawUnsafe(
    `
      UPDATE approval_tasks
      SET status = ?, decision_comment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    taskNextStatus,
    decisionComment || null,
    taskId
  );

  await prisma.$executeRawUnsafe(
    `
      UPDATE approval_documents
      SET status = ?, last_edited_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    documentNextStatus,
    action === "revise" ? task.created_by : employee.id,
    task.document_id
  );

  await addApprovalDocumentEvent({
    documentId: task.document_id,
    actorId: employee.id,
    eventType,
    comment: decisionComment || null,
    payload: {
      taskId,
      previousStepOrder: task.step_order
    }
  });
  await del(getDocumentCacheKey(task.company_id, task.document_id));
  await invalidateMyDocumentsListCaches(task.company_id);

  res.json({
    ok: true,
    taskId: String(taskId),
    documentId: String(task.document_id),
    status: documentNextStatus
  });
}

export async function approveTask(req: Request, res: Response): Promise<void> {
  try {
    await completeTaskDecision(req, res, "approve");
  } catch (error) {
    logger.error(`❌ Ошибка согласования задачи: ${error}`);
    res.status(500).json({ message: "Ошибка согласования задачи" });
  }
}

export async function rejectTask(req: Request, res: Response): Promise<void> {
  try {
    await completeTaskDecision(req, res, "reject");
  } catch (error) {
    logger.error(`❌ Ошибка отклонения задачи: ${error}`);
    res.status(500).json({ message: "Ошибка отклонения задачи" });
  }
}

export async function reviseTask(req: Request, res: Response): Promise<void> {
  try {
    await completeTaskDecision(req, res, "revise");
  } catch (error) {
    logger.error(`❌ Ошибка отправки задачи на доработку: ${error}`);
    res.status(500).json({ message: "Ошибка отправки задачи на доработку" });
  }
}

