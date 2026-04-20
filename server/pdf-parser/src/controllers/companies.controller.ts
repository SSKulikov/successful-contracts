import { Request, Response } from "express";
import prisma from "../prisma";
import { hashPassword } from "../utils/passwords";
import { ensureEmployeesTable, generateOneTimePassword, PLATFORM_DEMO_ADMIN_EMAIL } from "./admin.controller";
import { logger } from "../utils/logger";
import { companyAdminRoleSqlCondition, countCompanyAdminsTx } from "../utils/company-roles";

type CompanyListRow = {
  id: number;
  name: string;
  inn: string;
  admin_full_name: string | null;
  admin_employee_id: number | null;
};

/** Prisma часто кладёт текст MySQL в `cause`; без этого `Duplicate entry` не попадает в `message`. */
function getFullErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; current != null && depth < 8; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts.join(" ");
}

export async function listCompanies(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const rows = await prisma.$queryRawUnsafe<CompanyListRow[]>(
      `
      SELECT
        c.id,
        c.name,
        c.inn,
        (
          SELECT e.full_name
          FROM employees e
          WHERE e.company_id = c.id AND e.deleted_at IS NULL AND ${companyAdminRoleSqlCondition("e")}
          ORDER BY e.id ASC
          LIMIT 1
        ) AS admin_full_name,
        (
          SELECT e.id
          FROM employees e
          WHERE e.company_id = c.id AND e.deleted_at IS NULL AND ${companyAdminRoleSqlCondition("e")}
          ORDER BY e.id ASC
          LIMIT 1
        ) AS admin_employee_id
      FROM companies c
      ORDER BY c.id DESC
      `
    );

    const items = rows.map((row) => ({
      key: String(row.id),
      companyName: row.name,
      inn: row.inn,
      adminFullName: row.admin_full_name ?? ""
    }));

    res.json({ items });
  } catch (error) {
    logger.error(`❌ Ошибка списка компаний: ${error}`);
    res.status(500).json({
      message: "Ошибка получения компаний",
      error: error instanceof Error ? error.message : error
    });
  }
}

type CreateCompanyBody = {
  companyName?: string;
  inn?: string;
  adminFullName?: string;
  email?: string;
  password?: string;
};

export async function createCompany(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const body: CreateCompanyBody = req.body ?? {};
    const companyName = (body.companyName ?? "").trim();
    const inn = (body.inn ?? "").trim();
    const adminFullName = (body.adminFullName ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!companyName || !inn || !adminFullName || !email || !password) {
      res.status(400).json({ message: "Заполните все поля, включая пароль администратора" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "Пароль должен быть не короче 8 символов" });
      return;
    }

    const existingEmployeeRows = await prisma.$queryRawUnsafe<
      Array<{ id: number; company_id: number | null; deleted_at: Date | null }>
    >(
      `SELECT id, company_id, deleted_at FROM employees WHERE email = ? LIMIT 1`,
      email
    );

    if (email === PLATFORM_DEMO_ADMIN_EMAIL) {
      res.status(409).json({
        message:
          "Этот email зарезервирован для платформенного администратора и не может использоваться как админ компании."
      });
      return;
    }

    const existingEmployee = existingEmployeeRows[0] ?? null;
    const canReuseExistingEmployee =
      Boolean(existingEmployee) && existingEmployee!.deleted_at === null && existingEmployee!.company_id == null;

    if (existingEmployee && !canReuseExistingEmployee) {
      res.status(409).json({
        message:
          "Этот email уже зарегистрирован. Войдите на странице входа с тем же email и паролем; повторная регистрация компании не нужна."
      });
      return;
    }

    const dupInnRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM companies WHERE inn = ?`,
      inn
    );
    if (Number(dupInnRows[0]?.c ?? 0) > 0) {
      res.status(409).json({ message: "Компания с таким ИНН уже зарегистрирована" });
      return;
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO companies (name, inn) VALUES (?, ?)`, companyName, inn);

      const inserted = await tx.$queryRawUnsafe<Array<{ id: bigint }>>(`SELECT LAST_INSERT_ID() AS id`);
      const companyId = Number(inserted[0]?.id ?? 0);
      if (!companyId) {
        throw new Error("Не удалось получить id компании");
      }

      if ((await countCompanyAdminsTx(tx, companyId)) > 0) {
        throw new Error("COMPANY_ALREADY_HAS_ADMIN");
      }

      if (canReuseExistingEmployee && existingEmployee) {
        await tx.$executeRawUnsafe(
          `
          UPDATE employees
          SET full_name = ?, position = ?, roles_json = ?, password_value = ?, is_temporary_password = 0, status = ?, company_id = ?, deleted_at = NULL
          WHERE id = ?
          `,
          adminFullName,
          "Администратор",
          JSON.stringify(["admin"]),
          passwordHash,
          "Активен",
          companyId,
          existingEmployee.id
        );
      } else {
        await tx.$executeRawUnsafe(
          `
          INSERT INTO employees
            (full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          adminFullName,
          email,
          "Администратор",
          JSON.stringify(["admin"]),
          passwordHash,
          0,
          "Активен",
          companyId
        );
      }

      if ((await countCompanyAdminsTx(tx, companyId)) !== 1) {
        throw new Error("COMPANY_ADMIN_COUNT_INVALID");
      }
    });

    logger.info(`✅ Зарегистрирована компания: ${inn}`);
    res.status(201).json({ message: "Компания зарегистрирована" });
  } catch (error) {
    const message = getFullErrorText(error);
    logger.error(`❌ Ошибка регистрации компании: ${message}`);

    if (/Duplicate entry/i.test(message)) {
      if (/employees\.email/i.test(message) || /for key 'employees\.email'/i.test(message)) {
        res.status(409).json({
          message:
            "Этот email уже зарегистрирован. Войдите на странице входа с тем же email и паролем; повторная регистрация компании не нужна."
        });
        return;
      }
      if (/companies\.inn/i.test(message) || (/inn/i.test(message) && /companies/i.test(message))) {
        res.status(409).json({ message: "Компания с таким ИНН уже зарегистрирована" });
        return;
      }
    }

    res.status(500).json({
      message: "Ошибка регистрации компании",
      error: message
    });
  }
}

type UpdateCompanyBody = {
  companyName?: string;
  inn?: string;
  adminFullName?: string;
};

type AssignCompanyAdminBody = {
  email?: string;
  fullName?: string;
};

function ensureAdminRole(rolesJsonRaw: string | null): string {
  let roles: string[] = [];
  try {
    const parsed = JSON.parse(String(rolesJsonRaw ?? "[]"));
    if (Array.isArray(parsed)) {
      roles = parsed.filter((v) => typeof v === "string" && v.trim().length > 0);
    }
  } catch {
    roles = [];
  }
  if (!roles.includes("admin")) roles.push("admin");
  return JSON.stringify(roles);
}

function removeAdminRole(rolesJsonRaw: string | null): string {
  let roles: string[] = [];
  try {
    const parsed = JSON.parse(String(rolesJsonRaw ?? "[]"));
    if (Array.isArray(parsed)) {
      roles = parsed.filter((v) => typeof v === "string" && v.trim().length > 0);
    }
  } catch {
    roles = [];
  }
  return JSON.stringify(roles.filter((r) => r !== "admin"));
}

export async function updateCompany(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "Некорректный id компании" });
      return;
    }

    const body: UpdateCompanyBody = req.body ?? {};
    const companyName = (body.companyName ?? "").trim();
    const inn = (body.inn ?? "").trim();
    const adminFullName = (body.adminFullName ?? "").trim();

    if (!companyName || !inn || !adminFullName) {
      res.status(400).json({ message: "Укажите название компании, ИНН и имя администратора" });
      return;
    }

    const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM companies WHERE id = ? LIMIT 1`,
      id
    );
    if (!existing[0]) {
      res.status(404).json({ message: "Компания не найдена" });
      return;
    }

    const dupInn = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM companies WHERE inn = ? AND id <> ? LIMIT 1`,
      inn,
      id
    );
    if (dupInn[0]) {
      res.status(409).json({ message: "Компания с таким ИНН уже есть в списке" });
      return;
    }

    const adminCountRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM employees WHERE company_id = ? AND deleted_at IS NULL AND ${companyAdminRoleSqlCondition()}`,
      id
    );
    const adminCount = Number(adminCountRows[0]?.c ?? 0);
    if (adminCount === 0) {
      res.status(422).json({
        message: "У компании не найден администратор. Зарегистрируйте компанию заново или обратитесь в поддержку."
      });
      return;
    }
    if (adminCount > 1) {
      res.status(409).json({
        message:
          "В компании несколько администраторов — нарушение правил. Устраните дубликаты в базе или обратитесь в поддержку."
      });
      return;
    }

    await prisma.$executeRawUnsafe(`UPDATE companies SET name = ?, inn = ? WHERE id = ?`, companyName, inn, id);

    await prisma.$executeRawUnsafe(
      `
      UPDATE employees
      SET full_name = ?
      WHERE company_id = ? AND deleted_at IS NULL AND ${companyAdminRoleSqlCondition()}
      LIMIT 1
      `,
      adminFullName,
      id
    );

    logger.info(`✅ Обновлена компания id=${id}`);
    res.json({ message: "Данные компании обновлены" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Ошибка обновления компании: ${message}`);

    if (message.includes("Duplicate entry")) {
      res.status(409).json({ message: "Компания с таким ИНН уже зарегистрирована" });
      return;
    }

    res.status(500).json({
      message: "Ошибка обновления компании",
      error: message
    });
  }
}

export async function deleteCompany(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "Некорректный id компании" });
      return;
    }

    const exists = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM companies WHERE id = ? LIMIT 1`, id);
    if (!exists[0]) {
      res.status(404).json({ message: "Компания не найдена" });
      return;
    }

    await prisma.$executeRawUnsafe(`DELETE FROM companies WHERE id = ?`, id);

    logger.info(`✅ Удалена компания id=${id}`);
    res.json({ message: "Компания удалена" });
  } catch (error) {
    logger.error(`❌ Ошибка удаления компании: ${error}`);
    res.status(500).json({
      message: "Ошибка удаления компании",
      error: error instanceof Error ? error.message : error
    });
  }
}

export async function assignCompanyAdmin(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const companyId = Number(req.params.id);
    if (!companyId || Number.isNaN(companyId)) {
      res.status(400).json({ message: "Некорректный id компании" });
      return;
    }

    const body: AssignCompanyAdminBody = req.body ?? {};
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.fullName ?? "").trim();
    if (!email) {
      res.status(400).json({ message: "Укажите email сотрудника" });
      return;
    }

    if (email === PLATFORM_DEMO_ADMIN_EMAIL) {
      res.status(409).json({ message: "Этот email зарезервирован для платформенного администратора" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const companyRows = await tx.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT id FROM companies WHERE id = ? FOR UPDATE`,
        companyId
      );
      if (!companyRows[0]) {
        throw new Error("COMPANY_NOT_FOUND");
      }

      const candidateRows = await tx.$queryRawUnsafe<
        Array<{ id: number; full_name: string; company_id: number | null; deleted_at: Date | null; roles_json: string | null }>
      >(
        `SELECT id, full_name, company_id, deleted_at, roles_json FROM employees WHERE email = ? LIMIT 1 FOR UPDATE`,
        email
      );
      const candidate = candidateRows[0];
      if (!candidate) {
        throw new Error("CANDIDATE_NOT_FOUND");
      }
      if (candidate.deleted_at) {
        throw new Error("CANDIDATE_DELETED");
      }
      if (candidate.company_id !== null && candidate.company_id !== companyId) {
        throw new Error("CANDIDATE_IN_OTHER_COMPANY");
      }

      const currentAdmins = await tx.$queryRawUnsafe<Array<{ id: number; roles_json: string | null }>>(
        `SELECT id, roles_json FROM employees WHERE company_id = ? AND deleted_at IS NULL AND ${companyAdminRoleSqlCondition()} FOR UPDATE`,
        companyId
      );

      for (const row of currentAdmins) {
        if (row.id === candidate.id) continue;
        await tx.$executeRawUnsafe(
          `UPDATE employees SET roles_json = ? WHERE id = ?`,
          removeAdminRole(row.roles_json),
          row.id
        );
      }

      await tx.$executeRawUnsafe(
        `
        UPDATE employees
        SET full_name = ?, position = ?, roles_json = ?, status = ?, company_id = ?, deleted_at = NULL
        WHERE id = ?
        `,
        fullName || candidate.full_name,
        "Администратор",
        ensureAdminRole(candidate.roles_json),
        "Активен",
        companyId,
        candidate.id
      );
    });

    logger.info(`✅ Назначен администратор компании id=${companyId}: ${email}`);
    res.json({ message: "Администратор компании назначен" });
  } catch (error) {
    const message = getFullErrorText(error);
    logger.error(`❌ Ошибка назначения администратора компании: ${message}`);

    if (message.includes("COMPANY_NOT_FOUND")) {
      res.status(404).json({ message: "Компания не найдена" });
      return;
    }
    if (message.includes("CANDIDATE_NOT_FOUND")) {
      res.status(404).json({ message: "Сотрудник с таким email не найден" });
      return;
    }
    if (message.includes("CANDIDATE_DELETED")) {
      res.status(409).json({ message: "Сотрудник с таким email удалён и не может быть назначен администратором" });
      return;
    }
    if (message.includes("CANDIDATE_IN_OTHER_COMPANY")) {
      res.status(409).json({ message: "Сотрудник уже привязан к другой компании" });
      return;
    }

    res.status(500).json({
      message: "Ошибка назначения администратора компании",
      error: message
    });
  }
}

export async function resetCompanyAdmin(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "Некорректный id компании" });
      return;
    }

    const oneTimePassword = generateOneTimePassword();
    const passwordHash = await hashPassword(oneTimePassword);

    const adminRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `
      SELECT id FROM employees
      WHERE company_id = ? AND deleted_at IS NULL AND ${companyAdminRoleSqlCondition()}
      ORDER BY id ASC
      LIMIT 1
      `,
      id
    );
    if (!adminRows[0]) {
      res.status(404).json({ message: "Администратор компании не найден" });
      return;
    }

    const adminCountRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM employees WHERE company_id = ? AND deleted_at IS NULL AND ${companyAdminRoleSqlCondition()}`,
      id
    );
    if (Number(adminCountRows[0]?.c ?? 0) > 1) {
      res.status(409).json({
        message:
          "В компании несколько администраторов — сброс пароля недоступен. Устраните дубликаты в базе или обратитесь в поддержку."
      });
      return;
    }

    await prisma.$executeRawUnsafe(
      `
      UPDATE employees
      SET password_value = ?, is_temporary_password = 1
      WHERE id = ?
      `,
      passwordHash,
      adminRows[0].id
    );

    logger.info(`✅ Сброшен пароль администратора компании id=${id}`);
    res.json({
      message: "Новый одноразовый пароль выдан",
      oneTimePassword
    });
  } catch (error) {
    logger.error(`❌ Ошибка сброса администратора: ${error}`);
    res.status(500).json({
      message: "Ошибка сброса пароля администратора",
      error: error instanceof Error ? error.message : error
    });
  }
}
