import { createHash } from "crypto";
import { Request, Response } from "express";
import prisma from "../prisma";
import { logger } from "../utils/logger";
import * as XLSX from "xlsx";
import type { EmployeeAuthContext } from "../utils/auth-context";
import { del, getJson, invalidateMyDocumentsListCaches, setJson } from "../cache/redis";
import {
  addApprovalDocumentEvent,
  cancelPendingTasks,
  createPendingTask,
  ensureApprovalDomainTables,
  getApprovalDocumentAccessRow
} from "../services/ApprovalDomainService";

type DocumentStatus = "uploaded" | "in_approval" | "revision" | "rejected" | "approved";

type CreateDocumentBody = {
  type?: string;
  number?: string;
  date?: string;
  customerName?: string;
  customerInn?: string;
  executorName?: string;
  executorInn?: string;
  amount?: number | string;
  subject?: string;
  note?: string;
};

type UpdateDocumentBody = Partial<CreateDocumentBody>;
type DocumentListFilters = {
  status: string | null;
  type: string | null;
  q: string | null;
  number: string | null;
  counterparty: string | null;
  inn: string | null;
  dateFromRaw: string | null;
  dateToRaw: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};
type DocumentHistoryVariant = "create" | "submit" | "withdraw" | "resubmit" | "approve" | "reject" | "revise" | "update" | "other";

type DocumentDetailsResponse = {
  id: string;
  type: string;
  title: string;
  status: string;
  initiator: string;
  amount: string;
  currentStep: string;
  activeTaskId: string | null;
  canApproveCurrentStep: boolean;
  canWithdrawDocuments: boolean;
  canDeleteDocuments: boolean;
  canSubmitForApproval: boolean;
  canResubmitForApproval: boolean;
  createdAt: string;
  updatedAt: string;
  history: Array<{ id: string; date: string; action: string; author: string; variant: DocumentHistoryVariant }>;
  fields: {
    number: string;
    date: string;
    customerName: string;
    customerInn: string;
    executorName: string;
    executorInn: string;
    subject: string;
    note: string | null;
  };
};

function normalizeString(input: unknown) {
  return String(input ?? "").trim();
}

function normalizeOptionalString(input: unknown): string | null {
  const value = normalizeString(input);
  return value ? value : null;
}

function parseQueryDate(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseDocumentListFilters(query: Request["query"]): DocumentListFilters {
  const dateFromRaw = normalizeOptionalString(query.date_from);
  const dateToRaw = normalizeOptionalString(query.date_to);
  return {
    status: normalizeOptionalString(query.status),
    type: normalizeOptionalString(query.type),
    q: normalizeOptionalString(query.q),
    number: normalizeOptionalString(query.number),
    counterparty: normalizeOptionalString(query.counterparty),
    inn: normalizeOptionalString(query.inn),
    dateFromRaw,
    dateToRaw,
    dateFrom: dateFromRaw ? parseQueryDate(dateFromRaw) : null,
    dateTo: dateToRaw ? parseQueryDate(dateToRaw) : null
  };
}

/** Без фильтров списка: только видимость по роли/компании (для сводки по статусам). */
const EMPTY_MY_DOCUMENT_LIST_FILTERS: DocumentListFilters = {
  status: null,
  type: null,
  q: null,
  number: null,
  counterparty: null,
  inn: null,
  dateFromRaw: null,
  dateToRaw: null,
  dateFrom: null,
  dateTo: null
};

function buildDocumentListWhere(employee: EmployeeAuthContext, filters: DocumentListFilters) {
  const conditions: string[] = [];
  const values: Array<string | number | null> = [];

  if (employee.role === "admin") {
    if (employee.companyId === null) {
      conditions.push("d.company_id IS NULL");
    } else {
      conditions.push("d.company_id = ?");
      values.push(employee.companyId);
    }
  } else {
    conditions.push("(d.created_by = ? OR d.last_edited_by = ?)");
    values.push(employee.id, employee.id);

    if (employee.companyId === null) {
      conditions.push("d.company_id IS NULL");
    } else {
      conditions.push("d.company_id = ?");
      values.push(employee.companyId);
    }
  }

  if (filters.status) {
    conditions.push("d.status = ?");
    values.push(filters.status);
  }

  if (filters.type) {
    conditions.push("d.type = ?");
    values.push(filters.type);
  }

  if (filters.dateFrom) {
    conditions.push(`
      COALESCE(
        DATE(STR_TO_DATE(d.date_value, '%Y-%m-%d')),
        DATE(STR_TO_DATE(d.date_value, '%d.%m.%Y'))
      ) >= ?
    `);
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push(`
      COALESCE(
        DATE(STR_TO_DATE(d.date_value, '%Y-%m-%d')),
        DATE(STR_TO_DATE(d.date_value, '%d.%m.%Y'))
      ) <= ?
    `);
    values.push(filters.dateTo);
  }

  if (filters.number) {
    conditions.push("d.number_value LIKE ?");
    values.push(`%${filters.number}%`);
  }

  if (filters.counterparty) {
    conditions.push("(d.customer_name LIKE ? OR d.executor_name LIKE ?)");
    values.push(`%${filters.counterparty}%`, `%${filters.counterparty}%`);
  }

  if (filters.inn) {
    conditions.push("(d.customer_inn LIKE ? OR d.executor_inn LIKE ?)");
    values.push(`%${filters.inn}%`, `%${filters.inn}%`);
  }

  if (filters.q) {
    conditions.push(`
      (
        d.number_value LIKE ?
        OR d.customer_name LIKE ?
        OR d.executor_name LIKE ?
        OR d.customer_inn LIKE ?
        OR d.executor_inn LIKE ?
      )
    `);
    values.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, values };
}

function parseAmount(rawAmount: unknown) {
  if (typeof rawAmount === "number") return rawAmount;
  if (typeof rawAmount === "string") {
    const normalized = rawAmount.replace(",", ".").replace(/\s+/g, "");
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Number.NaN;
}

const MY_DOCUMENTS_LIST_CACHE_TTL_SECONDS = 120;

function getDocumentCacheKey(companyId: number | null, documentId: number) {
  const companyPart = companyId === null ? "none" : String(companyId);
  return `doc:${companyPart}:${documentId}`;
}

function buildMyDocumentsListCacheKey(employee: EmployeeAuthContext, filters: DocumentListFilters): string {
  const payload = {
    employeeId: employee.id,
    role: employee.role,
    status: filters.status ?? "",
    type: filters.type ?? "",
    q: filters.q ?? "",
    number: filters.number ?? "",
    counterparty: filters.counterparty ?? "",
    inn: filters.inn ?? "",
    dateFrom: filters.dateFrom ?? "",
    dateTo: filters.dateTo ?? ""
  };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
  const companyPart = employee.companyId === null ? "none" : String(employee.companyId);
  return `my-docs:${companyPart}:${hash}`;
}

export async function createDocument(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const body: CreateDocumentBody = req.body ?? {};
    const type = normalizeString(body.type);
    const numberValue = normalizeString(body.number);
    const dateValue = normalizeString(body.date);
    const customerName = normalizeString(body.customerName);
    const customerInn = normalizeString(body.customerInn);
    const executorName = normalizeString(body.executorName);
    const executorInn = normalizeString(body.executorInn);
    const subject = normalizeString(body.subject);
    const note = normalizeString(body.note) || null;
    const amount = parseAmount(body.amount);

    if (!type || !numberValue || !dateValue || !customerName || !customerInn || !executorName || !executorInn || !subject || Number.isNaN(amount)) {
      res.status(400).json({
        message: "Поля type, number, date, customerName, customerInn, executorName, executorInn, amount, subject обязательны"
      });
      return;
    }

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO approval_documents (
          company_id, type, number_value, date_value, customer_name, customer_inn, executor_name, executor_inn, amount, subject, note, status, created_by, last_edited_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      employee.companyId,
      type,
      numberValue,
      dateValue,
      customerName,
      customerInn,
      executorName,
      executorInn,
      amount,
      subject,
      note,
      "uploaded" as DocumentStatus,
      employee.id,
      employee.id
    );

    const insertedRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>("SELECT LAST_INSERT_ID() AS id");
    const documentId = insertedRows[0]?.id;
    if (!documentId) {
      res.status(500).json({ message: "Не удалось определить идентификатор созданного документа" });
      return;
    }

    await addApprovalDocumentEvent({
      documentId,
      actorId: employee.id,
      eventType: "document_created",
      payload: {
        source: "manual_form",
        createdByName: employee.fullName
      }
    });
    await del(getDocumentCacheKey(employee.companyId, documentId));
    await invalidateMyDocumentsListCaches(employee.companyId);

    res.status(201).json({
      id: String(documentId),
      status: "uploaded"
    });
  } catch (error) {
    logger.error(`❌ Ошибка создания документа согласования: ${error}`);
    res.status(500).json({ message: "Ошибка создания документа" });
  }
}

export async function listMyDocuments(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const filters = parseDocumentListFilters(req.query);
    if ((filters.dateFromRaw && !filters.dateFrom) || (filters.dateToRaw && !filters.dateTo)) {
      res.status(400).json({ message: "Некорректный формат date_from/date_to. Используйте формат YYYY-MM-DD" });
      return;
    }

    const listCacheKey = buildMyDocumentsListCacheKey(employee, filters);
    const cachedList = await getJson<{ items: unknown[] }>(listCacheKey);
    if (cachedList && Array.isArray(cachedList.items)) {
      res.json(cachedList);
      return;
    }

    const { whereClause, values } = buildDocumentListWhere(employee, filters);

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        type: string;
        number_value: string;
        date_value: string;
        status: DocumentStatus;
        customer_name: string;
        amount: string;
        created_at: Date;
      }>
    >(
      `
        SELECT d.id, d.type, d.number_value, d.status, d.customer_name, CAST(d.amount AS CHAR) AS amount, d.created_at
        FROM approval_documents d
        ${whereClause}
        ORDER BY d.created_at DESC
      `,
      ...values
    );

    const items = rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      title: `${row.type} №${row.number_value}`,
      status: row.status,
      counterparty: row.customer_name,
      amount: row.amount,
      createdAt: row.created_at
    }));

    const listPayload = { items };
    await setJson(listCacheKey, listPayload, MY_DOCUMENTS_LIST_CACHE_TTL_SECONDS);
    res.json(listPayload);
  } catch (error) {
    logger.error(`❌ Ошибка получения моих документов: ${error}`);
    res.status(500).json({ message: "Ошибка получения документов" });
  }
}

/** Сводка по статусам для «Мои документы» (те же правила видимости, что у списка; без фильтров таблицы). */
export async function getMyDocumentsStatusStats(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const { whereClause, values } = buildDocumentListWhere(employee, EMPTY_MY_DOCUMENT_LIST_FILTERS);

    const rows = await prisma.$queryRawUnsafe<Array<{ status: DocumentStatus; cnt: bigint }>>(
      `
        SELECT d.status, COUNT(*) AS cnt
        FROM approval_documents d
        ${whereClause}
        GROUP BY d.status
      `,
      ...values
    );

    const byStatus: Record<DocumentStatus, number> = {
      uploaded: 0,
      in_approval: 0,
      revision: 0,
      rejected: 0,
      approved: 0
    };

    for (const row of rows) {
      const key = row.status;
      if (key in byStatus) {
        byStatus[key as DocumentStatus] = Number(row.cnt);
      }
    }

    res.json({ byStatus });
  } catch (error) {
    logger.error(`❌ Ошибка сводки по статусам документов: ${error}`);
    res.status(500).json({ message: "Ошибка получения сводки" });
  }
}

export async function exportDocumentsXlsx(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const filters = parseDocumentListFilters(req.query);
    if ((filters.dateFromRaw && !filters.dateFrom) || (filters.dateToRaw && !filters.dateTo)) {
      res.status(400).json({ message: "Некорректный формат date_from/date_to. Используйте формат YYYY-MM-DD" });
      return;
    }

    const { whereClause, values } = buildDocumentListWhere(employee, filters);
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        type: string;
        number_value: string;
        date_value: string;
        customer_name: string;
        customer_inn: string;
        amount: string;
        status: DocumentStatus;
      }>
    >(
      `
        SELECT
          d.id,
          d.type,
          d.number_value,
          d.date_value,
          d.customer_name,
          d.customer_inn,
          CAST(d.amount AS CHAR) AS amount,
          d.status
        FROM approval_documents d
        ${whereClause}
        ORDER BY d.created_at DESC
      `,
      ...values
    );

    const publicAppUrl = (process.env.PUBLIC_APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
    const sheetRows = rows.map((row) => ({
      "Тип": row.type,
      "Номер": row.number_value,
      "Дата": row.date_value,
      "Контрагент": row.customer_name,
      "ИНН": row.customer_inn,
      "Сумма": row.amount,
      "Статус": mapStatusToRuLabel(row.status),
      "Ссылка": `${publicAppUrl}/documents/${row.id}`
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Документы");
    const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="documents.xlsx"');
    res.send(fileBuffer);
  } catch (error) {
    logger.error(`❌ Ошибка экспорта документов в Excel: ${error}`);
    res.status(500).json({ message: "Ошибка экспорта документов" });
  }
}

export async function submitDocument(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ message: "Некорректный id документа" });
      return;
    }

    const document = await getApprovalDocumentAccessRow(documentId);
    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    if (employee.companyId !== document.company_id) {
      res.status(403).json({ message: "Документ принадлежит другой компании" });
      return;
    }

    const canSubmit = employee.role === "admin" || document.created_by === employee.id || document.last_edited_by === employee.id;
    if (!canSubmit) {
      res.status(403).json({ message: "Недостаточно прав для отправки документа" });
      return;
    }

    if (document.status === "in_approval") {
      res.status(409).json({ message: "Документ уже находится на согласовании" });
      return;
    }
    if (document.status === "approved" || document.status === "rejected") {
      res.status(409).json({ message: "Документ в финальном статусе и не может быть отправлен" });
      return;
    }

    await prisma.$executeRawUnsafe(
      `
        UPDATE approval_documents
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      "in_approval" as DocumentStatus,
      documentId
    );

    await cancelPendingTasks(documentId);

    // До подключения маршрутов от Dev2 назначаем первую задачу отправителю.
    await createPendingTask(documentId, employee.id, 1);

    await addApprovalDocumentEvent({
      documentId,
      actorId: employee.id,
      eventType: "document_submitted",
      payload: {
        submitterId: employee.id
      }
    });
    await del(getDocumentCacheKey(employee.companyId, documentId));
    await invalidateMyDocumentsListCaches(document.company_id);

    res.json({ ok: true, id: String(documentId), status: "in_approval" });
  } catch (error) {
    logger.error(`❌ Ошибка отправки документа на согласование: ${error}`);
    res.status(500).json({ message: "Ошибка отправки документа" });
  }
}

export async function resubmitDocument(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ message: "Некорректный id документа" });
      return;
    }

    const document = await getApprovalDocumentAccessRow(documentId);
    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    if (employee.companyId !== document.company_id) {
      res.status(403).json({ message: "Документ принадлежит другой компании" });
      return;
    }

    const canResubmit = employee.role === "admin" || document.created_by === employee.id || document.last_edited_by === employee.id;
    if (!canResubmit) {
      res.status(403).json({ message: "Недостаточно прав для повторной отправки документа" });
      return;
    }

    if (document.status !== "revision") {
      res.status(409).json({ message: "Повторная отправка доступна только для документов на доработке" });
      return;
    }

    await cancelPendingTasks(documentId);

    await prisma.$executeRawUnsafe(
      `
        UPDATE approval_documents
        SET status = ?, last_edited_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      "in_approval" as DocumentStatus,
      employee.id,
      documentId
    );

    // До подключения маршрутов от Dev2 назначаем первый шаг отправителю.
    await createPendingTask(documentId, employee.id, 1);

    await addApprovalDocumentEvent({
      documentId,
      actorId: employee.id,
      eventType: "document_resubmitted",
      payload: {
        resubmitterId: employee.id
      }
    });
    await del(getDocumentCacheKey(employee.companyId, documentId));
    await invalidateMyDocumentsListCaches(document.company_id);

    res.json({ ok: true, id: String(documentId), status: "in_approval" });
  } catch (error) {
    logger.error(`❌ Ошибка повторной отправки документа: ${error}`);
    res.status(500).json({ message: "Ошибка повторной отправки документа" });
  }
}

export async function withdrawDocument(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ message: "Некорректный id документа" });
      return;
    }

    const document = await getApprovalDocumentAccessRow(documentId);
    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    if (employee.companyId !== document.company_id) {
      res.status(403).json({ message: "Документ принадлежит другой компании" });
      return;
    }

    const canWithdraw = employee.role === "admin" || document.created_by === employee.id || document.last_edited_by === employee.id;
    if (!canWithdraw) {
      res.status(403).json({ message: "Недостаточно прав для отзыва документа" });
      return;
    }

    if (document.status !== "in_approval") {
      res.status(409).json({ message: "Отозвать можно только документ в статусе 'На согласовании'" });
      return;
    }

    await cancelPendingTasks(documentId);

    await prisma.$executeRawUnsafe(
      `
        UPDATE approval_documents
        SET status = ?, last_edited_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      "uploaded" as DocumentStatus,
      employee.id,
      documentId
    );

    await addApprovalDocumentEvent({
      documentId,
      actorId: employee.id,
      eventType: "document_withdrawn",
      payload: {
        withdrawerId: employee.id
      }
    });
    await del(getDocumentCacheKey(employee.companyId, documentId));
    await invalidateMyDocumentsListCaches(document.company_id);

    res.json({ ok: true, id: String(documentId), status: "uploaded" });
  } catch (error) {
    logger.error(`❌ Ошибка отзыва документа с согласования: ${error}`);
    res.status(500).json({ message: "Ошибка отзыва документа" });
  }
}

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ message: "Некорректный id документа" });
      return;
    }

    const document = await getApprovalDocumentAccessRow(documentId);
    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    if (employee.companyId !== document.company_id) {
      res.status(403).json({ message: "Документ принадлежит другой компании" });
      return;
    }

    const canDelete = employee.role === "admin" || document.created_by === employee.id || document.last_edited_by === employee.id;
    if (!canDelete) {
      res.status(403).json({ message: "Недостаточно прав для удаления документа" });
      return;
    }

    if (document.status === "in_approval") {
      res.status(409).json({ message: "Сначала отзовите документ с согласования" });
      return;
    }
    if (document.status === "approved") {
      res.status(409).json({ message: "Нельзя удалить документ в статусе 'Согласован'" });
      return;
    }

    await prisma.$executeRawUnsafe(
      `
        DELETE FROM approval_documents
        WHERE id = ?
      `,
      documentId
    );
    await del(getDocumentCacheKey(employee.companyId, documentId));
    await invalidateMyDocumentsListCaches(document.company_id);

    res.json({ ok: true, id: String(documentId) });
  } catch (error) {
    logger.error(`❌ Ошибка удаления документа: ${error}`);
    res.status(500).json({ message: "Ошибка удаления документа" });
  }
}

export async function updateDocument(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ message: "Некорректный id документа" });
      return;
    }

    const document = await getApprovalDocumentAccessRow(documentId);
    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    if (employee.companyId !== document.company_id) {
      res.status(403).json({ message: "Документ принадлежит другой компании" });
      return;
    }

    if (document.status !== "revision" && document.status !== "uploaded") {
      res.status(409).json({ message: "Редактирование доступно только для документов в статусах 'Загружен' или 'На доработке'" });
      return;
    }

    const canEdit = employee.role === "admin" || document.created_by === employee.id || document.last_edited_by === employee.id;
    if (!canEdit) {
      res.status(403).json({ message: "Недостаточно прав для редактирования документа" });
      return;
    }

    const body: UpdateDocumentBody = req.body ?? {};
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (body.type !== undefined) {
      const value = normalizeString(body.type);
      if (!value) {
        res.status(400).json({ message: "Поле type не может быть пустым" });
        return;
      }
      updates.push("type = ?");
      values.push(value);
    }

    if (body.number !== undefined) {
      const value = normalizeString(body.number);
      if (!value) {
        res.status(400).json({ message: "Поле number не может быть пустым" });
        return;
      }
      updates.push("number_value = ?");
      values.push(value);
    }

    if (body.date !== undefined) {
      const value = normalizeString(body.date);
      if (!value) {
        res.status(400).json({ message: "Поле date не может быть пустым" });
        return;
      }
      updates.push("date_value = ?");
      values.push(value);
    }

    if (body.customerName !== undefined) {
      const value = normalizeString(body.customerName);
      if (!value) {
        res.status(400).json({ message: "Поле customerName не может быть пустым" });
        return;
      }
      updates.push("customer_name = ?");
      values.push(value);
    }

    if (body.customerInn !== undefined) {
      const value = normalizeString(body.customerInn);
      if (!value) {
        res.status(400).json({ message: "Поле customerInn не может быть пустым" });
        return;
      }
      updates.push("customer_inn = ?");
      values.push(value);
    }

    if (body.executorName !== undefined) {
      const value = normalizeString(body.executorName);
      if (!value) {
        res.status(400).json({ message: "Поле executorName не может быть пустым" });
        return;
      }
      updates.push("executor_name = ?");
      values.push(value);
    }

    if (body.executorInn !== undefined) {
      const value = normalizeString(body.executorInn);
      if (!value) {
        res.status(400).json({ message: "Поле executorInn не может быть пустым" });
        return;
      }
      updates.push("executor_inn = ?");
      values.push(value);
    }

    if (body.subject !== undefined) {
      const value = normalizeString(body.subject);
      if (!value) {
        res.status(400).json({ message: "Поле subject не может быть пустым" });
        return;
      }
      updates.push("subject = ?");
      values.push(value);
    }

    if (body.note !== undefined) {
      const value = normalizeString(body.note);
      updates.push("note = ?");
      values.push(value || null);
    }

    if (body.amount !== undefined) {
      const value = parseAmount(body.amount);
      if (Number.isNaN(value)) {
        res.status(400).json({ message: "Поле amount должно быть числом" });
        return;
      }
      updates.push("amount = ?");
      values.push(value);
    }

    if (updates.length === 0) {
      res.status(400).json({ message: "Отсутствуют поля для обновления" });
      return;
    }

    updates.push("last_edited_by = ?");
    values.push(employee.id);
    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(documentId);

    await prisma.$executeRawUnsafe(
      `
        UPDATE approval_documents
        SET ${updates.join(", ")}
        WHERE id = ?
      `,
      ...values
    );

    await addApprovalDocumentEvent({
      documentId,
      actorId: employee.id,
      eventType: "document_updated",
      payload: {
        fields: updates.filter((item) => item !== "last_edited_by = ?" && item !== "updated_at = CURRENT_TIMESTAMP").map((item) => item.split(" = ")[0])
      }
    });
    await del(getDocumentCacheKey(employee.companyId, documentId));
    await invalidateMyDocumentsListCaches(document.company_id);

    res.json({ ok: true, id: String(documentId) });
  } catch (error) {
    logger.error(`❌ Ошибка редактирования документа: ${error}`);
    res.status(500).json({ message: "Ошибка редактирования документа" });
  }
}

function mapStatusToRuLabel(status: DocumentStatus): string {
  if (status === "uploaded") return "Загружен";
  if (status === "in_approval") return "На согласовании";
  if (status === "revision") return "На доработке";
  if (status === "rejected") return "Отклонен";
  return "Согласован";
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function mapEventAction(eventType: string): string {
  if (eventType === "document_created") return "Документ создан";
  if (eventType === "document_submitted") return "Отправлен на согласование";
  if (eventType === "document_withdrawn") return "Отозван с согласования";
  if (eventType === "task_approved") return "Шаг согласован";
  if (eventType === "task_rejected") return "Документ отклонен";
  if (eventType === "task_revise_requested") return "Отправлен на доработку";
  if (eventType === "document_resubmitted") return "Повторно отправлен на согласование";
  if (eventType === "document_updated") return "Документ обновлён";
  return eventType;
}

function mapHistoryVariant(eventType: string): DocumentHistoryVariant {
  if (eventType === "document_created") return "create";
  if (eventType === "document_submitted" || eventType === "document_resubmitted") return "submit";
  if (eventType === "document_withdrawn") return "withdraw";
  if (eventType === "task_approved") return "approve";
  if (eventType === "task_rejected") return "reject";
  if (eventType === "task_revise_requested") return "revise";
  if (eventType === "document_updated") return "update";
  return "other";
}

export async function getDocumentById(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ message: "Некорректный id документа" });
      return;
    }

    const documentRows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        company_id: number | null;
        type: string;
        number_value: string;
        date_value: string;
        status: DocumentStatus;
        customer_name: string;
        customer_inn: string;
        executor_name: string;
        executor_inn: string;
        amount: string;
        subject: string;
        note: string | null;
        created_by: number;
        last_edited_by: number;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `
        SELECT
          id,
          company_id,
          type,
          number_value,
          date_value,
          status,
          customer_name,
          customer_inn,
          executor_name,
          executor_inn,
          CAST(amount AS CHAR) AS amount,
          subject,
          note,
          created_by,
          last_edited_by,
          created_at,
          updated_at
        FROM approval_documents
        WHERE id = ?
        LIMIT 1
      `,
      documentId
    );

    const doc = documentRows[0];
    if (!doc) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    if (employee.companyId !== doc.company_id) {
      res.status(403).json({ message: "Документ принадлежит другой компании" });
      return;
    }

    if (employee.role !== "admin" && doc.created_by !== employee.id && doc.last_edited_by !== employee.id) {
      const assignedRows = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
        `
          SELECT COUNT(*) AS cnt
          FROM approval_tasks
          WHERE document_id = ?
            AND assignee_user_id = ?
        `,
        documentId,
        employee.id
      );
      const hasAssignment = Number(assignedRows[0]?.cnt ?? 0) > 0;
      if (!hasAssignment) {
        res.status(403).json({ message: "Недостаточно прав для просмотра документа" });
        return;
      }
    }

    const cacheKey = getDocumentCacheKey(employee.companyId, documentId);
    const cachedPayload = await getJson<DocumentDetailsResponse>(cacheKey);
    if (cachedPayload) {
      res.json(cachedPayload);
      return;
    }

    const currentStepRows = await prisma.$queryRawUnsafe<Array<{ id: number; step_order: number; assignee_user_id: number }>>(
      `
        SELECT id, step_order, assignee_user_id
        FROM approval_tasks
        WHERE document_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      documentId
    );
    const currentStep = currentStepRows[0]?.step_order ? `Шаг ${currentStepRows[0].step_order}` : "Не назначен";
    const activeTaskId = currentStepRows[0]?.id ? String(currentStepRows[0].id) : null;
    const canApproveCurrentStep = Boolean(
      currentStepRows[0]?.assignee_user_id === employee.id && (employee.role === "admin" || doc.created_by !== employee.id)
    );

    const eventRows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        event_type: string;
        comment: string | null;
        created_at: Date;
        actor_name: string | null;
      }>
    >(
      `
        SELECT
          e.id,
          e.event_type,
          e.comment,
          e.created_at,
          emp.full_name AS actor_name
        FROM approval_document_events e
        LEFT JOIN employees emp ON emp.id = e.actor_id
        WHERE e.document_id = ?
        ORDER BY e.created_at DESC, e.id DESC
      `,
      documentId
    );

    const history = eventRows.map((event) => ({
      id: String(event.id),
      date: formatDateTime(event.created_at),
      action: event.comment ? `${mapEventAction(event.event_type)}: ${event.comment}` : mapEventAction(event.event_type),
      author: event.actor_name ?? "Удаленный пользователь",
      variant: mapHistoryVariant(event.event_type)
    }));

    const canEditFlow = employee.role === "admin" || doc.created_by === employee.id || doc.last_edited_by === employee.id;
    const canWithdrawDocuments = canEditFlow && doc.status === "in_approval";
    const canDeleteDocuments = canEditFlow && doc.status !== "in_approval" && doc.status !== "approved";
    const canSubmitForApproval = canEditFlow && doc.status === "uploaded";
    const canResubmitForApproval = canEditFlow && doc.status === "revision";

    const responsePayload: DocumentDetailsResponse = {
      id: String(doc.id),
      type: doc.type,
      title: `${doc.type} №${doc.number_value}`,
      status: mapStatusToRuLabel(doc.status),
      initiator: doc.customer_name,
      amount: doc.amount,
      currentStep,
      activeTaskId,
      canApproveCurrentStep,
      canWithdrawDocuments,
      canDeleteDocuments,
      canSubmitForApproval,
      canResubmitForApproval,
      createdAt: formatDateTime(doc.created_at),
      updatedAt: formatDateTime(doc.updated_at),
      history,
      fields: {
        number: doc.number_value,
        date: doc.date_value,
        customerName: doc.customer_name,
        customerInn: doc.customer_inn,
        executorName: doc.executor_name,
        executorInn: doc.executor_inn,
        subject: doc.subject,
        note: doc.note
      }
    };

    await setJson(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    logger.error(`❌ Ошибка получения карточки документа: ${error}`);
    res.status(500).json({ message: "Ошибка получения карточки документа" });
  }
}

