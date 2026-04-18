import { createHash } from "crypto";
import { Request, Response } from "express";
import prisma from "../prisma";
import { logger } from "../utils/logger";
import * as XLSX from "xlsx";
import type { EmployeeAuthContext } from "../utils/auth-context";
import { isPlatformAdministrator } from "../utils/auth-context";
import { del, getJson, invalidateMyDocumentsListCachesAfterMutation, setJson } from "../cache/redis";
import {
  addApprovalDocumentEvent,
  cancelPendingTasks,
  createAdHocApprovalRoute,
  createTasksFromRoute,
  ensureApprovalDomainTables,
  getApprovalDocumentAccessRow,
  type ApprovalRouteStepRow
} from "../services/ApprovalDomainService";
import {
  getDocumentTitleLine,
  getFirstPendingAssigneeId,
  getPendingAssigneeIds,
  insertNotification
} from "../services/NotificationService";
import { ensureEmployeesTable } from "./admin.controller";
import { parseApproverEmployeeIds } from "../utils/parse-approver-employee-ids";

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
  /** Для платформенного админа (`companyId` в JWT = null) — компания-владелец документа (обязательно). */
  companyId?: number | string;
};

type UpdateDocumentBody = Partial<CreateDocumentBody>;
type SubmitDocumentBody = {
  routeId?: number | string;
  /** Произвольная цепочка согласующих (создаётся одноразовый маршрут). */
  approverEmployeeIds?: unknown;
};

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
  /** Подписи шагов маршрута (если маршрут уже привязан к документу). */
  approvalChain: string[];
  activeTaskId: string | null;
  canApproveCurrentStep: boolean;
  canWithdrawDocuments: boolean;
  canDeleteDocuments: boolean;
  canSubmitForApproval: boolean;
  canResubmitForApproval: boolean;
  /** Редактирование полей через PATCH в статусах «Загружен» и «На доработке». */
  canEditDocumentFields: boolean;
  /** Компания документа; у платформенного админа нужна для выбора маршрута из админки. */
  companyId: number | null;
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

const ROLE_STEP_LABEL_FOR_DOC: Record<string, string> = {
  admin: "Админ компании",
  lawyer: "Юрист",
  financier: "Финансист",
  accountant: "Бухгалтер"
};

async function buildApprovalChainLabels(companyId: number, routeId: number): Promise<string[]> {
  const steps = await prisma.$queryRawUnsafe<ApprovalRouteStepRow[]>(
    `SELECT * FROM approval_route_steps WHERE route_id = ? ORDER BY step_order ASC`,
    routeId
  );
  if (!steps.length) return [];

  const empIds = new Set<number>();
  for (const s of steps) {
    if (s.assignee_employee_id) empIds.add(s.assignee_employee_id);
    if (s.default_employee_id) empIds.add(s.default_employee_id);
  }
  const ids = [...empIds];
  const nameById = new Map<number, string>();
  if (ids.length) {
    const iph = ids.map(() => "?").join(",");
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; full_name: string }>>(
      `SELECT id, full_name FROM employees WHERE company_id = ? AND id IN (${iph}) AND deleted_at IS NULL`,
      companyId,
      ...ids
    );
    for (const row of rows) {
      nameById.set(row.id, row.full_name);
    }
  }
  const nameOf = (eid: number | null) => {
    if (!eid) return "?";
    return nameById.get(eid) ?? `Сотрудник №${eid}`;
  };

  return steps.map((s) => {
    const who =
      s.assignee_kind === "employee"
        ? nameOf(s.assignee_employee_id)
        : `${ROLE_STEP_LABEL_FOR_DOC[s.role_key ?? ""] ?? s.role_key ?? "?"} — ${nameOf(s.default_employee_id)}`;
    return `${s.step_order}. ${who}`;
  });
}

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

function isGlobalPlatformAdmin(employee: EmployeeAuthContext): boolean {
  return employee.role === "admin" && employee.companyId === null;
}

function canAccessDocumentCompany(employee: EmployeeAuthContext, docCompanyId: number | null): boolean {
  if (isGlobalPlatformAdmin(employee)) return true;
  return employee.companyId === docCompanyId;
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
    if (isGlobalPlatformAdmin(employee)) {
      /* платформенный админ — все документы всех компаний */
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
    conditions.push(`DATE(d.created_at) >= ?`);
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push(`DATE(d.created_at) <= ?`);
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
  return `doc:v2:${companyPart}:${documentId}`;
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
  const companyPart = isGlobalPlatformAdmin(employee) ? "all" : employee.companyId === null ? "none" : String(employee.companyId);
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

    let documentCompanyId: number | null = employee.companyId;
    if (isGlobalPlatformAdmin(employee)) {
      const rawCid = body.companyId;
      const cid = typeof rawCid === "number" ? rawCid : Number(rawCid);
      if (!Number.isInteger(cid) || cid <= 0) {
        res.status(400).json({
          message: "Для платформенного администратора укажите companyId — компанию-владельца документа (из справочника компаний)"
        });
        return;
      }
      const companyRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT id FROM companies WHERE id = ? LIMIT 1`,
        cid
      );
      if (!companyRows[0]) {
        res.status(400).json({ message: "Компания с указанным companyId не найдена" });
        return;
      }
      documentCompanyId = cid;
    }

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO approval_documents (
          company_id, type, number_value, date_value, customer_name, customer_inn, executor_name, executor_inn, amount, subject, note, status, created_by, last_edited_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      documentCompanyId,
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
    await del(getDocumentCacheKey(documentCompanyId, documentId));
    await invalidateMyDocumentsListCachesAfterMutation(documentCompanyId);

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
        company_id: number | null;
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
        SELECT d.id, d.company_id, d.type, d.number_value, d.status, d.customer_name, CAST(d.amount AS CHAR) AS amount, d.created_at
        FROM approval_documents d
        ${whereClause}
        ORDER BY d.created_at DESC
      `,
      ...values
    );

    const items = rows.map((row) => ({
      id: String(row.id),
      companyId: row.company_id,
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

    if (!canAccessDocumentCompany(employee, document.company_id)) {
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

    const body: SubmitDocumentBody = req.body ?? {};
    const approverIds = parseApproverEmployeeIds(body.approverEmployeeIds);

    let parsedRouteId: number;

    if (approverIds.length > 0) {
      if (document.company_id == null) {
        res.status(400).json({ message: "У документа не указана компания — нельзя построить цепочку согласования" });
        return;
      }
      try {
        parsedRouteId = await createAdHocApprovalRoute(document.company_id, approverIds);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка создания цепочки согласования";
        res.status(400).json({ message: msg });
        return;
      }
    } else {
      const rid = Number(body.routeId);
      if (!Number.isInteger(rid) || rid <= 0) {
        res.status(400).json({ message: "Укажите цепочку согласующих (approverEmployeeIds) или маршрут (routeId)" });
        return;
      }

      const routeRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `
          SELECT id
          FROM approval_routes
          WHERE id = ?
            AND company_id <=> ?
          LIMIT 1
        `,
        rid,
        document.company_id
      );
      if (!routeRows[0]) {
        res.status(400).json({ message: "Маршрут не найден или не принадлежит компании документа" });
        return;
      }
      parsedRouteId = rid;
    }

    await prisma.$executeRawUnsafe(
      `
        UPDATE approval_documents
        SET status = ?, route_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      "in_approval" as DocumentStatus,
      parsedRouteId,
      documentId
    );

    await cancelPendingTasks(documentId);
    await createTasksFromRoute(documentId, parsedRouteId);

    await addApprovalDocumentEvent({
      documentId,
      actorId: employee.id,
      eventType: "document_submitted",
      payload: {
        submitterId: employee.id
      }
    });
    const titleLineSubmitted = await getDocumentTitleLine(documentId);
    const assigneeSubmitted = await getFirstPendingAssigneeId(documentId);
    if (assigneeSubmitted != null && assigneeSubmitted !== employee.id) {
      await insertNotification({
        companyId: document.company_id,
        recipientEmployeeId: assigneeSubmitted,
        documentId,
        eventType: "document_submitted",
        title: `Новая задача согласования: ${titleLineSubmitted}`,
        body: "Документ отправлен на согласование"
      });
    }
    await del(getDocumentCacheKey(document.company_id, documentId));
    await invalidateMyDocumentsListCachesAfterMutation(document.company_id);

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

    if (!canAccessDocumentCompany(employee, document.company_id)) {
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

    if (!document.route_id) {
      res.status(409).json({ message: "Для повторной отправки сначала выберите маршрут согласования" });
      return;
    }

    const routeRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `
        SELECT id
        FROM approval_routes
        WHERE id = ?
          AND company_id <=> ?
        LIMIT 1
      `,
      document.route_id,
      document.company_id
    );
    if (!routeRows[0]) {
      res.status(409).json({ message: "Маршрут согласования недоступен. Выберите маршрут и отправьте документ заново" });
      return;
    }

    await cancelPendingTasks(documentId);

    await prisma.$executeRawUnsafe(
      `
        UPDATE approval_documents
        SET status = ?, route_id = ?, last_edited_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      "in_approval" as DocumentStatus,
      document.route_id,
      employee.id,
      documentId
    );
    await createTasksFromRoute(documentId, document.route_id);

    await addApprovalDocumentEvent({
      documentId,
      actorId: employee.id,
      eventType: "document_resubmitted",
      payload: {
        resubmitterId: employee.id
      }
    });
    const titleLineResubmitted = await getDocumentTitleLine(documentId);
    const assigneeResubmitted = await getFirstPendingAssigneeId(documentId);
    if (assigneeResubmitted != null && assigneeResubmitted !== employee.id) {
      await insertNotification({
        companyId: document.company_id,
        recipientEmployeeId: assigneeResubmitted,
        documentId,
        eventType: "document_resubmitted",
        title: `Новая задача согласования: ${titleLineResubmitted}`,
        body: "Документ снова отправлен на согласование"
      });
    }
    await del(getDocumentCacheKey(document.company_id, documentId));
    await invalidateMyDocumentsListCachesAfterMutation(document.company_id);

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

    if (!canAccessDocumentCompany(employee, document.company_id)) {
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

    const titleLineWithdraw = await getDocumentTitleLine(documentId);
    const assigneeIdsWithdraw = await getPendingAssigneeIds(documentId);

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
    for (const uid of assigneeIdsWithdraw) {
      if (uid !== employee.id) {
        await insertNotification({
          companyId: document.company_id,
          recipientEmployeeId: uid,
          documentId,
          eventType: "document_withdrawn",
          title: `Документ снят с согласования: ${titleLineWithdraw}`,
          body: "Инициатор отозвал документ с согласования"
        });
      }
    }
    await del(getDocumentCacheKey(document.company_id, documentId));
    await invalidateMyDocumentsListCachesAfterMutation(document.company_id);

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

    if (!canAccessDocumentCompany(employee, document.company_id)) {
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
    await del(getDocumentCacheKey(document.company_id, documentId));
    await invalidateMyDocumentsListCachesAfterMutation(document.company_id);

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

    if (!canAccessDocumentCompany(employee, document.company_id)) {
      res.status(403).json({ message: "Документ принадлежит другой компании" });
      return;
    }

    if (document.status !== "revision" && document.status !== "uploaded") {
      res.status(409).json({
        message: "Редактирование полей доступно в статусах «Загружен» и «На доработке»"
      });
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
    await del(getDocumentCacheKey(document.company_id, documentId));
    await invalidateMyDocumentsListCachesAfterMutation(document.company_id);

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
        route_id: number | null;
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
          route_id,
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

    if (!canAccessDocumentCompany(employee, doc.company_id)) {
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

    const cacheKey = getDocumentCacheKey(doc.company_id, documentId);
    const cachedPayload = await getJson<DocumentDetailsResponse>(cacheKey);
    if (cachedPayload) {
      res.json(cachedPayload);
      return;
    }

    const currentStepRows = await prisma.$queryRawUnsafe<
      Array<{ id: number; step_order: number; assignee_user_id: number; assignee_name: string | null }>
    >(
      `
        SELECT t.id, t.step_order, t.assignee_user_id,
               CASE WHEN e.deleted_at IS NOT NULL THEN NULL ELSE e.full_name END AS assignee_name
        FROM approval_tasks t
        LEFT JOIN employees e ON e.id = t.assignee_user_id
        WHERE t.document_id = ? AND t.status = 'pending'
        ORDER BY t.step_order ASC, t.id ASC
        LIMIT 1
      `,
      documentId
    );

    let totalRouteSteps = 0;
    if (doc.route_id) {
      const cntRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM approval_route_steps WHERE route_id = ?`,
        doc.route_id
      );
      totalRouteSteps = Number(cntRows[0]?.c ?? 0);
    }

    const pending = currentStepRows[0];
    let currentStep = "Не назначен";
    if (pending?.step_order) {
      const who = pending.assignee_name?.trim() ? pending.assignee_name : "Сотрудник";
      currentStep =
        totalRouteSteps > 0
          ? `Шаг ${pending.step_order} из ${totalRouteSteps}: ${who}`
          : `Шаг ${pending.step_order}: ${who}`;
    } else if (doc.status === "in_approval") {
      currentStep = "Ожидание назначения задачи";
    }

    const activeTaskId = pending?.id ? String(pending.id) : null;
    const canApproveCurrentStep = Boolean(
      pending?.assignee_user_id === employee.id && (employee.role === "admin" || doc.created_by !== employee.id)
    );

    let approvalChain: string[] = [];
    if (doc.company_id != null && doc.route_id) {
      approvalChain = await buildApprovalChainLabels(doc.company_id, doc.route_id);
    }

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
          CASE WHEN emp.deleted_at IS NOT NULL THEN NULL ELSE emp.full_name END AS actor_name
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
    const canEditDocumentFields = canEditFlow && (doc.status === "uploaded" || doc.status === "revision");

    const responsePayload: DocumentDetailsResponse = {
      id: String(doc.id),
      type: doc.type,
      title: `${doc.type} №${doc.number_value}`,
      status: mapStatusToRuLabel(doc.status),
      initiator: doc.customer_name,
      amount: doc.amount,
      currentStep,
      approvalChain,
      activeTaskId,
      canApproveCurrentStep,
      canWithdrawDocuments,
      canDeleteDocuments,
      canSubmitForApproval,
      canResubmitForApproval,
      canEditDocumentFields,
      companyId: doc.company_id,
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

/** Сотрудники компании для выбора цепочки согласования (активные, не удалённые). */
export async function listCompanyEmployees(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const employee = req.authContext!;
    let companyId: number | null = employee.companyId;

    if (isPlatformAdministrator(employee)) {
      const raw = req.query.companyId;
      const q = typeof raw === "string" || typeof raw === "number" ? Number(raw) : Number.NaN;
      if (!Number.isInteger(q) || q <= 0) {
        res.status(400).json({ message: "Для платформенного администратора укажите query-параметр companyId" });
        return;
      }
      companyId = q;
    } else if (!companyId) {
      res.status(403).json({ message: "У вас нет привязки к компании" });
      return;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; full_name: string; position: string }>>(
      `
        SELECT id, full_name, position
        FROM employees
        WHERE company_id = ?
          AND deleted_at IS NULL
          AND status = 'Активен'
        ORDER BY full_name ASC
      `,
      companyId
    );

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        position: r.position?.trim() ? r.position : "Сотрудник"
      }))
    });
  } catch (error) {
    logger.error(`❌ Ошибка списка сотрудников компании: ${error}`);
    res.status(500).json({ message: "Ошибка получения сотрудников" });
  }
}

