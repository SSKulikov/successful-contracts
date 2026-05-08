import { Request, Response } from "express";
import prisma from "../prisma";
import { logger } from "../utils/logger";
import { ensureEmployeesTable, generateOneTimePassword } from "./admin.controller";
import { hashPassword } from "../utils/passwords";
import { companyAdminRoleSqlCondition, countCompanyAdminsTx, countOtherCompanyAdminsTx, lockCompanyRowForUpdate } from "../utils/company-roles";

function requireCompanyAdmin(req: Request, res: Response): { companyId: number; employeeId: number } | null {
  const auth = req.authContext!;
  if (auth.role !== "admin" || auth.companyId == null) {
    res.status(403).json({ message: "Доступно только администратору компании" });
    return null;
  }
  return { companyId: auth.companyId, employeeId: auth.id };
}

export async function listCompanyAdminEmployees(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();
    const guard = requireCompanyAdmin(req, res);
    if (!guard) return;
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; full_name: string; email: string; position: string; roles_json: string; status: string; company_id: number | null; deleted_at: Date | null }>>(
      `SELECT id, full_name, email, position, roles_json, status, company_id, deleted_at FROM employees WHERE company_id = ? ORDER BY id DESC`,
      guard.companyId
    );
    const items = rows
      .filter((r) => !r.deleted_at)
      .map((r) => ({
        key: String(r.id),
        fullName: r.full_name,
        email: r.email,
        position: r.position,
        roles: JSON.parse(r.roles_json ?? "[]") as string[],
        status: r.status === "Неактивен" ? "Неактивен" : "Активен",
        companyId: r.company_id ?? null
      }));
    res.json({ items });
  } catch (error) {
    logger.error(`❌ Ошибка списка сотрудников компании: ${error}`);
    res.status(500).json({ message: "Ошибка получения сотрудников компании" });
  }
}

export async function createCompanyAdminEmployee(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();
    const guard = requireCompanyAdmin(req, res);
    if (!guard) return;
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const position = String(req.body?.position ?? "").trim();
    const roles = Array.isArray(req.body?.roles) ? (req.body.roles as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
    if (!fullName || !email || !position || roles.length === 0) {
      res.status(400).json({ message: "Заполните fullName, email, position, roles" });
      return;
    }
    const oneTimePassword = generateOneTimePassword();
    const passwordHash = await hashPassword(oneTimePassword);
    await prisma.$transaction(async (tx) => {
      if (roles.includes("admin")) {
        const locked = await lockCompanyRowForUpdate(tx, guard.companyId);
        if (!locked || (await countCompanyAdminsTx(tx, guard.companyId)) > 0) {
          throw new Error("COMPANY_ADMIN_EXISTS");
        }
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO employees (full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id) VALUES (?, ?, ?, ?, ?, 1, 'Активен', ?)`,
        fullName,
        email,
        position,
        JSON.stringify(roles),
        passwordHash,
        guard.companyId
      );
    });
    res.status(201).json({ message: "Сотрудник создан", oneTimePassword });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("COMPANY_ADMIN_EXISTS")) {
      res.status(409).json({ message: "В компании может быть только один администратор" });
      return;
    }
    res.status(500).json({ message: "Ошибка создания сотрудника компании" });
  }
}

export async function updateCompanyAdminEmployee(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();
    const guard = requireCompanyAdmin(req, res);
    if (!guard) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Некорректный id" });
      return;
    }
    const row = await prisma.$queryRawUnsafe<Array<{ id: number; company_id: number | null; roles_json: string }>>(
      `SELECT id, company_id, roles_json FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      id
    );
    if (!row[0] || row[0].company_id !== guard.companyId) {
      res.status(404).json({ message: "Сотрудник не найден" });
      return;
    }
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const position = String(req.body?.position ?? "").trim();
    const roles = Array.isArray(req.body?.roles) ? (req.body.roles as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
    const status = req.body?.status === "Неактивен" ? "Неактивен" : "Активен";
    if (!fullName || !email || !position || roles.length === 0) {
      res.status(400).json({ message: "Заполните fullName, email, position, roles" });
      return;
    }
    await prisma.$transaction(async (tx) => {
      if (roles.includes("admin")) {
        const locked = await lockCompanyRowForUpdate(tx, guard.companyId);
        if (!locked || (await countOtherCompanyAdminsTx(tx, guard.companyId, id)) > 0) {
          throw new Error("COMPANY_ADMIN_EXISTS");
        }
      }
      await tx.$executeRawUnsafe(
        `UPDATE employees SET full_name = ?, email = ?, position = ?, roles_json = ?, status = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL`,
        fullName,
        email,
        position,
        JSON.stringify(roles),
        status,
        id,
        guard.companyId
      );
    });
    res.json({ message: "Сотрудник обновлен" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("COMPANY_ADMIN_EXISTS")) {
      res.status(409).json({ message: "В компании может быть только один администратор" });
      return;
    }
    res.status(500).json({ message: "Ошибка обновления сотрудника компании" });
  }
}

export async function deleteCompanyAdminEmployee(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();
    const guard = requireCompanyAdmin(req, res);
    if (!guard) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Некорректный id" });
      return;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE employees SET deleted_at = CURRENT_TIMESTAMP(3), email = CONCAT('deleted.', id, '.', UNIX_TIMESTAMP(), '@deleted.invalid') WHERE id = ? AND company_id = ? AND deleted_at IS NULL`,
      id,
      guard.companyId
    );
    res.json({ ok: true, id: String(id) });
  } catch (error) {
    logger.error(`❌ Ошибка удаления сотрудника компании: ${error}`);
    res.status(500).json({ message: "Ошибка удаления сотрудника компании" });
  }
}

export async function resetCompanyAdminEmployeePassword(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();
    const guard = requireCompanyAdmin(req, res);
    if (!guard) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Некорректный id" });
      return;
    }
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; company_id: number | null; deleted_at: Date | null }>>(
      `SELECT id, company_id, deleted_at FROM employees WHERE id = ? LIMIT 1`,
      id
    );
    const employee = rows[0];
    if (!employee || employee.company_id !== guard.companyId || employee.deleted_at) {
      res.status(404).json({ message: "Сотрудник не найден" });
      return;
    }
    const oneTimePassword = generateOneTimePassword();
    const passwordHash = await hashPassword(oneTimePassword);
    await prisma.$executeRawUnsafe(
      `UPDATE employees SET password_value = ?, is_temporary_password = 1 WHERE id = ? AND company_id = ? AND deleted_at IS NULL`,
      passwordHash,
      id,
      guard.companyId
    );
    res.json({ message: "Одноразовый пароль обновлен", oneTimePassword });
  } catch (error) {
    logger.error(`❌ Ошибка сброса пароля сотрудника компании: ${error}`);
    res.status(500).json({ message: "Ошибка сброса пароля сотрудника компании" });
  }
}

export async function getMyCompanyProfile(req: Request, res: Response): Promise<void> {
  try {
    const guard = requireCompanyAdmin(req, res);
    if (!guard) return;
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; name: string; inn: string }>>(
      `SELECT id, name, inn FROM companies WHERE id = ? LIMIT 1`,
      guard.companyId
    );
    if (!rows[0]) {
      res.status(404).json({ message: "Компания не найдена" });
      return;
    }
    res.json({ companyId: rows[0].id, companyName: rows[0].name, inn: rows[0].inn });
  } catch (error) {
    logger.error(`❌ Ошибка профиля компании: ${error}`);
    res.status(500).json({ message: "Ошибка получения профиля компании" });
  }
}
