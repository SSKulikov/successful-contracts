import { Request, Response } from "express";
import prisma from "../prisma";
import { ensureApprovalDomainTables } from "../services/ApprovalDomainService";
import type { ApprovalRouteRow, ApprovalRouteStepRow, AssigneeKind } from "../services/ApprovalDomainService";
import { logger } from "../utils/logger";

// ── Типы запроса / ответа ──────────────────────────────────────────

type StepPayload = {
  stepOrder: number;
  assigneeKind: AssigneeKind;
  assigneeEmployeeId?: number | null;
  roleKey?: string | null;
  defaultEmployeeId?: number | null;
};

type CreateRouteBody = {
  companyId?: number;
  name?: string;
  isDefault?: boolean;
  /** Как у документов: «Договор», «Счет на оплату» и т.д.; пусто — подходит любому типу. */
  documentType?: string | null;
  steps?: StepPayload[];
};

const ROUTE_DOCUMENT_TYPES = ["Договор", "УПД", "Счет на оплату", "Акт", "Накладная"] as const;

const ROLE_STEP_LABEL: Record<string, string> = {
  admin: "Админ компании",
  lawyer: "Юрист",
  financier: "Финансист",
  accountant: "Бухгалтер"
};

function normalizeRouteDocumentType(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!(ROUTE_DOCUMENT_TYPES as readonly string[]).includes(v)) {
    return null;
  }
  return v;
}

type RouteWithSteps = {
  id: number;
  companyId: number;
  name: string;
  isDefault: boolean;
  documentType: string | null;
  steps: Array<{
    id: number;
    stepOrder: number;
    assigneeKind: AssigneeKind;
    assigneeEmployeeId: number | null;
    roleKey: string | null;
    defaultEmployeeId: number | null;
    assigneeSummary: string;
  }>;
};

// ── Хелперы ────────────────────────────────────────────────────────

function mapRouteRow(
  r: ApprovalRouteRow,
  steps: ApprovalRouteStepRow[],
  nameMap: Map<string, string>
): RouteWithSteps {
  const nameOf = (cid: number, eid: number | null) => {
    if (!eid) return "?";
    return nameMap.get(`${cid}:${eid}`) ?? `Сотрудник №${eid}`;
  };

  return {
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    isDefault: r.is_default === 1,
    documentType: r.document_type ?? null,
    steps: steps
      .filter((s) => s.route_id === r.id)
      .sort((a, b) => a.step_order - b.step_order)
      .map((s) => ({
        id: s.id,
        stepOrder: s.step_order,
        assigneeKind: s.assignee_kind,
        assigneeEmployeeId: s.assignee_employee_id,
        roleKey: s.role_key,
        defaultEmployeeId: s.default_employee_id,
        assigneeSummary:
          s.assignee_kind === "employee"
            ? nameOf(r.company_id, s.assignee_employee_id)
            : `${ROLE_STEP_LABEL[s.role_key ?? ""] ?? s.role_key ?? "?"} — ${nameOf(r.company_id, s.default_employee_id)}`
      }))
  };
}

async function buildRouteItemsWithSummaries(routes: ApprovalRouteRow[], steps: ApprovalRouteStepRow[]): Promise<RouteWithSteps[]> {
  if (!routes.length) return [];

  const companyIds = [...new Set(routes.map((r) => r.company_id))];
  const empIds = new Set<number>();
  for (const s of steps) {
    if (s.assignee_employee_id) empIds.add(s.assignee_employee_id);
    if (s.default_employee_id) empIds.add(s.default_employee_id);
  }
  const ids = [...empIds];
  const nameMap = new Map<string, string>();
  if (companyIds.length && ids.length) {
    const cph = companyIds.map(() => "?").join(",");
    const iph = ids.map(() => "?").join(",");
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; company_id: number; full_name: string }>>(
      `SELECT id, company_id, full_name FROM employees WHERE company_id IN (${cph}) AND id IN (${iph}) AND deleted_at IS NULL`,
      ...companyIds,
      ...ids
    );
    for (const row of rows) {
      nameMap.set(`${row.company_id}:${row.id}`, row.full_name);
    }
  }

  return routes.map((r) => mapRouteRow(r, steps, nameMap));
}

const VALID_ASSIGNEE_KINDS: AssigneeKind[] = ["employee", "role_default"];

function validateSteps(steps: StepPayload[], errors: string[]): void {
  if (!steps.length) {
    errors.push("Маршрут должен содержать хотя бы один шаг");
    return;
  }

  const orders = steps.map((s) => s.stepOrder);
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      errors.push(`stepOrder должны быть последовательными от 1 до ${steps.length} без пропусков`);
      break;
    }
  }

  if (new Set(orders).size !== orders.length) {
    errors.push("stepOrder не должны повторяться");
  }

  for (const s of steps) {
    if (!VALID_ASSIGNEE_KINDS.includes(s.assigneeKind)) {
      errors.push(`Шаг ${s.stepOrder}: assigneeKind должен быть "employee" или "role_default"`);
      continue;
    }

    if (s.assigneeKind === "employee") {
      if (!s.assigneeEmployeeId) {
        errors.push(`Шаг ${s.stepOrder}: для kind=employee обязателен assigneeEmployeeId`);
      }
    } else {
      if (!s.roleKey) {
        errors.push(`Шаг ${s.stepOrder}: для kind=role_default обязателен roleKey`);
      }
      if (!s.defaultEmployeeId) {
        errors.push(`Шаг ${s.stepOrder}: для kind=role_default обязателен defaultEmployeeId`);
      }
    }
  }
}

async function employeeBelongsToCompany(employeeId: number, companyId: number): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM employees WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
    employeeId,
    companyId
  );
  return !!rows[0];
}

// ── Контроллер: платформенный админ ────────────────────────────────

export async function listRoutesAdmin(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const companyId = req.query.companyId ? Number(req.query.companyId) : null;

    const routes = companyId
      ? await prisma.$queryRawUnsafe<ApprovalRouteRow[]>(
          `SELECT * FROM approval_routes WHERE company_id = ? ORDER BY id DESC`,
          companyId
        )
      : await prisma.$queryRawUnsafe<ApprovalRouteRow[]>(
          `SELECT * FROM approval_routes ORDER BY id DESC`
        );

    const routeIds = routes.map((r) => r.id);
    let steps: ApprovalRouteStepRow[] = [];
    if (routeIds.length) {
      const placeholders = routeIds.map(() => "?").join(",");
      steps = await prisma.$queryRawUnsafe<ApprovalRouteStepRow[]>(
        `SELECT * FROM approval_route_steps WHERE route_id IN (${placeholders}) ORDER BY step_order`,
        ...routeIds
      );
    }

    const items = await buildRouteItemsWithSummaries(routes, steps);
    res.json({ items });
  } catch (error) {
    logger.error(`❌ Ошибка списка маршрутов: ${error}`);
    res.status(500).json({ message: "Ошибка получения маршрутов" });
  }
}

export async function createRouteAdmin(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const body: CreateRouteBody = req.body ?? {};
    const companyId = body.companyId;
    const name = (body.name ?? "").trim();
    const isDefault = !!body.isDefault;
    const steps: StepPayload[] = Array.isArray(body.steps) ? body.steps : [];
    const rawDocType = body.documentType;
    const docTypeNorm = normalizeRouteDocumentType(rawDocType);
    if (rawDocType !== undefined && rawDocType !== null && String(rawDocType).trim() !== "" && !docTypeNorm) {
      res.status(400).json({ message: `documentType должен быть одним из: ${ROUTE_DOCUMENT_TYPES.join(", ")} или пустым` });
      return;
    }

    if (!companyId) {
      res.status(400).json({ message: "companyId обязателен" });
      return;
    }
    if (!name) {
      res.status(400).json({ message: "Название маршрута обязательно" });
      return;
    }

    const errors: string[] = [];
    validateSteps(steps, errors);
    if (errors.length) {
      res.status(400).json({ message: errors.join("; ") });
      return;
    }

    const companyExists = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM companies WHERE id = ? LIMIT 1`,
      companyId
    );
    if (!companyExists[0]) {
      res.status(404).json({ message: "Компания не найдена" });
      return;
    }

    for (const s of steps) {
      const empId = s.assigneeKind === "employee" ? s.assigneeEmployeeId : s.defaultEmployeeId;
      if (empId && !(await employeeBelongsToCompany(empId, companyId))) {
        res.status(400).json({
          message: `Шаг ${s.stepOrder}: сотрудник id=${empId} не принадлежит компании id=${companyId}`
        });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.$executeRawUnsafe(
          `UPDATE approval_routes SET is_default = 0 WHERE company_id = ? AND is_default = 1`,
          companyId
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO approval_routes (company_id, name, is_default, document_type) VALUES (?, ?, ?, ?)`,
        companyId,
        name,
        isDefault ? 1 : 0,
        docTypeNorm
      );

      const inserted = await tx.$queryRawUnsafe<Array<{ id: bigint }>>(`SELECT LAST_INSERT_ID() AS id`);
      const routeId = Number(inserted[0]?.id ?? 0);
      if (!routeId) throw new Error("Не удалось получить id маршрута");

      for (const s of steps) {
        await tx.$executeRawUnsafe(
          `INSERT INTO approval_route_steps
            (route_id, step_order, assignee_kind, assignee_employee_id, role_key, default_employee_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          routeId,
          s.stepOrder,
          s.assigneeKind,
          s.assigneeKind === "employee" ? s.assigneeEmployeeId! : null,
          s.assigneeKind === "role_default" ? s.roleKey! : null,
          s.assigneeKind === "role_default" ? s.defaultEmployeeId! : null
        );
      }
    });

    logger.info(`✅ Создан маршрут «${name}» для компании id=${companyId}`);
    res.status(201).json({ message: "Маршрут создан" });
  } catch (error) {
    logger.error(`❌ Ошибка создания маршрута: ${error}`);
    res.status(500).json({ message: "Ошибка создания маршрута" });
  }
}

export async function updateRouteAdmin(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const routeId = Number(req.params.id);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      res.status(400).json({ message: "Некорректный id маршрута" });
      return;
    }

    const existing = await prisma.$queryRawUnsafe<ApprovalRouteRow[]>(
      `SELECT * FROM approval_routes WHERE id = ? LIMIT 1`,
      routeId
    );
    if (!existing[0]) {
      res.status(404).json({ message: "Маршрут не найден" });
      return;
    }

    const route = existing[0];
    const body: CreateRouteBody = req.body ?? {};
    const name = (body.name ?? "").trim();
    const isDefault = body.isDefault !== undefined ? !!body.isDefault : route.is_default === 1;
    const steps: StepPayload[] = Array.isArray(body.steps) ? body.steps : [];
    const rawDocTypeUpd = body.documentType;
    let nextDocType: string | null = route.document_type ?? null;
    if (rawDocTypeUpd !== undefined) {
      const nt = normalizeRouteDocumentType(rawDocTypeUpd);
      if (String(rawDocTypeUpd ?? "").trim() !== "" && !nt) {
        res.status(400).json({ message: `documentType должен быть одним из: ${ROUTE_DOCUMENT_TYPES.join(", ")} или пустым` });
        return;
      }
      nextDocType = nt;
    }

    if (!name) {
      res.status(400).json({ message: "Название маршрута обязательно" });
      return;
    }

    const errors: string[] = [];
    validateSteps(steps, errors);
    if (errors.length) {
      res.status(400).json({ message: errors.join("; ") });
      return;
    }

    for (const s of steps) {
      const empId = s.assigneeKind === "employee" ? s.assigneeEmployeeId : s.defaultEmployeeId;
      if (empId && !(await employeeBelongsToCompany(empId, route.company_id))) {
        res.status(400).json({
          message: `Шаг ${s.stepOrder}: сотрудник id=${empId} не принадлежит компании id=${route.company_id}`
        });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.$executeRawUnsafe(
          `UPDATE approval_routes SET is_default = 0 WHERE company_id = ? AND is_default = 1 AND id <> ?`,
          route.company_id,
          routeId
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE approval_routes SET name = ?, is_default = ?, document_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        name,
        isDefault ? 1 : 0,
        nextDocType,
        routeId
      );

      await tx.$executeRawUnsafe(`DELETE FROM approval_route_steps WHERE route_id = ?`, routeId);

      for (const s of steps) {
        await tx.$executeRawUnsafe(
          `INSERT INTO approval_route_steps
            (route_id, step_order, assignee_kind, assignee_employee_id, role_key, default_employee_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          routeId,
          s.stepOrder,
          s.assigneeKind,
          s.assigneeKind === "employee" ? s.assigneeEmployeeId! : null,
          s.assigneeKind === "role_default" ? s.roleKey! : null,
          s.assigneeKind === "role_default" ? s.defaultEmployeeId! : null
        );
      }
    });

    logger.info(`✅ Обновлён маршрут id=${routeId}`);
    res.json({ message: "Маршрут обновлён" });
  } catch (error) {
    logger.error(`❌ Ошибка обновления маршрута: ${error}`);
    res.status(500).json({ message: "Ошибка обновления маршрута" });
  }
}

export async function deleteRouteAdmin(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const routeId = Number(req.params.id);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      res.status(400).json({ message: "Некорректный id маршрута" });
      return;
    }

    const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM approval_routes WHERE id = ? LIMIT 1`,
      routeId
    );
    if (!existing[0]) {
      res.status(404).json({ message: "Маршрут не найден" });
      return;
    }

    await prisma.$executeRawUnsafe(`DELETE FROM approval_routes WHERE id = ?`, routeId);

    logger.info(`✅ Удалён маршрут id=${routeId}`);
    res.json({ message: "Маршрут удалён" });
  } catch (error) {
    logger.error(`❌ Ошибка удаления маршрута: ${error}`);
    res.status(500).json({ message: "Ошибка удаления маршрута" });
  }
}

// ── Контроллер: админ компании (для UI submit / управления) ────────

export async function listCompanyRoutes(req: Request, res: Response): Promise<void> {
  try {
    await ensureApprovalDomainTables();

    const employee = req.authContext!;
    if (employee.role !== "admin") {
      res.status(403).json({ message: "Маршруты компании доступны только администратору компании" });
      return;
    }
    if (!employee.companyId) {
      res.status(403).json({ message: "У вас нет привязки к компании" });
      return;
    }

    const routes = await prisma.$queryRawUnsafe<ApprovalRouteRow[]>(
      `SELECT * FROM approval_routes WHERE company_id = ? ORDER BY id DESC`,
      employee.companyId
    );

    const routeIds = routes.map((r) => r.id);
    let steps: ApprovalRouteStepRow[] = [];
    if (routeIds.length) {
      const placeholders = routeIds.map(() => "?").join(",");
      steps = await prisma.$queryRawUnsafe<ApprovalRouteStepRow[]>(
        `SELECT * FROM approval_route_steps WHERE route_id IN (${placeholders}) ORDER BY step_order`,
        ...routeIds
      );
    }

    const items = await buildRouteItemsWithSummaries(routes, steps);
    res.json({ items });
  } catch (error) {
    logger.error(`❌ Ошибка списка маршрутов компании: ${error}`);
    res.status(500).json({ message: "Ошибка получения маршрутов" });
  }
}
