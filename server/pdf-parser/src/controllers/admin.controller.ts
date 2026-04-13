import { Request, Response } from "express";
import prisma from "../prisma";
import { logger } from "../utils/logger";

type CreateEmployeeBody = {
  fullName?: string;
  email?: string;
  position?: string;
  roles?: string[];
  oneTimePassword?: string;
  companyId?: number;
};

type EmployeeRow = {
  id: number;
  full_name: string;
  email: string;
  position: string;
  roles_json: string;
  status: "Активен" | "Неактивен";
  created_at: Date;
};

export function generateOneTimePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

/**
 * Гарантирует наличие демо-записей в `employees` (схема таблиц — через Prisma migrate).
 * Вызывать после `prisma migrate deploy` на деплое.
 */
export async function ensureEmployeesTable() {
  await ensurePlatformDemoAdmin();
}

/** Email учётной «платформенного» демо-админа (совпадает с вводом на клиенте при логине admin/111). */
export const PLATFORM_DEMO_ADMIN_EMAIL = "platform-admin@docflow.local";

async function ensurePlatformDemoAdmin() {
  const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM employees WHERE email = ? LIMIT 1`,
    PLATFORM_DEMO_ADMIN_EMAIL
  );
  if (existing[0]) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO employees (full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "Администратор платформы",
    PLATFORM_DEMO_ADMIN_EMAIL,
    "Администратор",
    JSON.stringify(["admin"]),
    "111",
    0,
    "Активен",
    null
  );
  logger.info(`✅ Создана учётная запись платформенного админа: ${PLATFORM_DEMO_ADMIN_EMAIL}`);
}

export async function ensureAuthSessionsTable() {
  await ensureEmployeesTable();
}

export async function listEmployees(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const rows = await prisma.$queryRawUnsafe<EmployeeRow[]>(
      "SELECT id, full_name, email, position, roles_json, status, created_at FROM employees ORDER BY id DESC"
    );

    const items = rows.map((row) => {
      let parsedRoles: string[] = [];
      try {
        parsedRoles = JSON.parse(row.roles_json ?? "[]");
      } catch {
        parsedRoles = [];
      }

      return {
        key: String(row.id),
        fullName: row.full_name,
        email: row.email,
        position: row.position,
        roles: parsedRoles,
        status: row.status
      };
    });

    res.json({ items });
  } catch (error) {
    logger.error(`❌ Ошибка получения сотрудников: ${error}`);
    res.status(500).json({
      message: "Ошибка получения сотрудников",
      error: error instanceof Error ? error.message : error
    });
  }
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const body: CreateEmployeeBody = req.body ?? {};
    const fullName = (body.fullName ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const position = (body.position ?? "").trim();
    const roles = Array.isArray(body.roles) ? body.roles.filter((role) => typeof role === "string" && role.trim()) : [];

    let companyId: number | null = null;
    if (body.companyId != null) {
      const n = Number(body.companyId);
      if (!Number.isNaN(n) && n > 0) companyId = n;
    }

    if (!fullName || !email || !position || roles.length === 0) {
      res.status(400).json({
        message: "Поля fullName, email, position и roles обязательны"
      });
      return;
    }

    const oneTimePassword =
      typeof body.oneTimePassword === "string" && body.oneTimePassword.trim()
        ? body.oneTimePassword.trim()
        : generateOneTimePassword();

    await prisma.$executeRawUnsafe(
      "INSERT INTO employees (full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      fullName,
      email,
      position,
      JSON.stringify(roles),
      oneTimePassword,
      1,
      "Активен",
      companyId
    );

    logger.info(`✅ Создан сотрудник: ${email}`);
    res.status(201).json({
      message: "Сотрудник создан",
      employee: {
        fullName,
        email,
        position,
        roles,
        status: "Активен"
      },
      oneTimePassword
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Ошибка создания сотрудника: ${message}`);

    if (message.includes("Duplicate entry")) {
      res.status(409).json({ message: "Сотрудник с таким email уже существует" });
      return;
    }

    res.status(500).json({
      message: "Ошибка создания сотрудника",
      error: message
    });
  }
}
