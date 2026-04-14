import { Request, Response } from "express";
import { setPasswordHashRedis } from "../cache/redis";
import prisma from "../prisma";
import { hashPassword, isBcryptHash } from "../utils/passwords";
import { logger } from "../utils/logger";
import { countCompanyAdminsTx, lockCompanyRowForUpdate } from "../utils/company-roles";

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

function rolesIncludeCompanyAdmin(roles: string[]): boolean {
  return roles.some((r) => r === "admin");
}

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
  const existing = await prisma.$queryRawUnsafe<Array<{ id: number; password_value: string }>>(
    `SELECT id, password_value FROM employees WHERE email = ? LIMIT 1`,
    PLATFORM_DEMO_ADMIN_EMAIL
  );
  if (existing[0]) {
    if (!isBcryptHash(existing[0].password_value)) {
      const migrated = await hashPassword(existing[0].password_value);
      await prisma.$executeRawUnsafe(
        `UPDATE employees SET password_value = ? WHERE id = ?`,
        migrated,
        existing[0].id
      );
      await setPasswordHashRedis(existing[0].id, migrated);
    } else {
      await setPasswordHashRedis(existing[0].id, existing[0].password_value);
    }
    return;
  }

  const passwordHash = await hashPassword("111");
  await prisma.$executeRawUnsafe(
    `INSERT INTO employees (full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "Администратор платформы",
    PLATFORM_DEMO_ADMIN_EMAIL,
    "Администратор",
    JSON.stringify(["admin"]),
    passwordHash,
    0,
    "Активен",
    null
  );
  const ins = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM employees WHERE email = ? LIMIT 1`,
    PLATFORM_DEMO_ADMIN_EMAIL
  );
  if (ins[0]) {
    await setPasswordHashRedis(ins[0].id, passwordHash);
  }
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

    if (rolesIncludeCompanyAdmin(roles) && companyId === null) {
      res.status(400).json({
        message:
          "Роль администратора компании (admin) можно назначить только вместе с companyId. Платформенных администраторов создаёт только система."
      });
      return;
    }

    const oneTimePassword =
      typeof body.oneTimePassword === "string" && body.oneTimePassword.trim()
        ? body.oneTimePassword.trim()
        : generateOneTimePassword();

    const passwordHash = await hashPassword(oneTimePassword);

    const insertSql =
      "INSERT INTO employees (full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const insertParams = [
      fullName,
      email,
      position,
      JSON.stringify(roles),
      passwordHash,
      1,
      "Активен",
      companyId
    ] as const;

    if (companyId !== null) {
      const companyExists = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT id FROM companies WHERE id = ? LIMIT 1`,
        companyId
      );
      if (!companyExists[0]) {
        res.status(404).json({ message: "Компания не найдена" });
        return;
      }
    }

    if (companyId !== null && rolesIncludeCompanyAdmin(roles)) {
      await prisma.$transaction(async (tx) => {
        const locked = await lockCompanyRowForUpdate(tx, companyId);
        if (!locked) {
          throw new Error("COMPANY_NOT_FOUND");
        }
        if ((await countCompanyAdminsTx(tx, companyId)) >= 1) {
          throw new Error("COMPANY_ADMIN_EXISTS");
        }
        await tx.$executeRawUnsafe(insertSql, ...insertParams);
      });
    } else {
      await prisma.$executeRawUnsafe(insertSql, ...insertParams);
    }

    const idRow = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM employees WHERE email = ? LIMIT 1`,
      email
    );
    if (idRow[0]) {
      await setPasswordHashRedis(idRow[0].id, passwordHash);
    }

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

    if (message.includes("COMPANY_ADMIN_EXISTS")) {
      res.status(409).json({
        message: "В этой компании уже есть администратор. У компании может быть только один администратор."
      });
      return;
    }
    if (message.includes("COMPANY_NOT_FOUND")) {
      res.status(404).json({ message: "Компания не найдена" });
      return;
    }

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
