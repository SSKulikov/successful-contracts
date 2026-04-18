import { Request, Response } from "express";
import prisma from "../prisma";
import { hashPassword, isBcryptHash } from "../utils/passwords";
import { logger } from "../utils/logger";
import { countCompanyAdminsTx, countOtherCompanyAdminsTx, lockCompanyRowForUpdate } from "../utils/company-roles";

type CreateEmployeeBody = {
  fullName?: string;
  email?: string;
  position?: string;
  roles?: string[];
  oneTimePassword?: string;
  companyId?: number;
};

type UpdateEmployeeBody = {
  fullName?: string;
  email?: string;
  position?: string;
  roles?: string[];
  companyId?: number | null;
  status?: "Активен" | "Неактивен";
};

type EmployeeRow = {
  id: number;
  full_name: string;
  email: string;
  position: string;
  roles_json: string;
  status: "Активен" | "Неактивен";
  company_id: number | null;
  created_at: Date;
  deleted_at: Date | null;
};

function rolesIncludeCompanyAdmin(roles: string[]): boolean {
  return roles.some((r) => r === "admin");
}

export function generateOneTimePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

/** Email учётной «платформенного» демо-админа (совпадает с вводом на клиенте при логине admin/111). */
export const PLATFORM_DEMO_ADMIN_EMAIL = "platform-admin@docflow.local";

async function ensurePlatformDemoAdmin() {
  const existing = await prisma.$queryRawUnsafe<
    Array<{ id: number; password_value: string; deleted_at: Date | null }>
  >(
    `SELECT id, password_value, deleted_at FROM employees WHERE email = ? LIMIT 1`,
    PLATFORM_DEMO_ADMIN_EMAIL
  );
  if (existing[0]) {
    const row = existing[0];
    if (row.deleted_at) {
      const passwordHash = await hashPassword("111");
      await prisma.$executeRawUnsafe(
        `UPDATE employees SET deleted_at = NULL, status = ?, password_value = ?, is_temporary_password = 0 WHERE id = ?`,
        "Активен",
        passwordHash,
        row.id
      );
      logger.info(`✅ Восстановлена учётная платформенного админа (была помечена удалённой): ${PLATFORM_DEMO_ADMIN_EMAIL}`);
      return;
    }
    if (!isBcryptHash(row.password_value)) {
      const migrated = await hashPassword(row.password_value);
      await prisma.$executeRawUnsafe(
        `UPDATE employees SET password_value = ? WHERE id = ?`,
        migrated,
        row.id
      );
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
  logger.info(`✅ Создана учётная запись платформенного админа: ${PLATFORM_DEMO_ADMIN_EMAIL}`);
}

async function ensureEmployeeDeletedAtColumn() {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'deleted_at'`
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) {
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE employees ADD COLUMN deleted_at DATETIME(3) NULL`);
}

async function ensureEmployeeAvatarUrlColumn() {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'avatar_url'`
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) {
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE employees ADD COLUMN avatar_url VARCHAR(512) NULL`);
}

/**
 * Гарантирует наличие демо-записей в `employees` и идемпотентные колонки (`deleted_at`, `avatar_url`).
 * Вызывать после `prisma migrate deploy` на деплое; до миграции колонки могут добавиться здесь при первом логине.
 */
export async function ensureEmployeesTable() {
  await ensurePlatformDemoAdmin();
  await ensureEmployeeDeletedAtColumn();
  await ensureEmployeeAvatarUrlColumn();
}

export async function ensureAuthSessionsTable() {
  await ensureEmployeesTable();
}

export async function listEmployees(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const includeDeleted = String(req.query.includeDeleted ?? "").trim() === "1";
    const whereClause = includeDeleted ? "" : "WHERE deleted_at IS NULL";

    const rows = await prisma.$queryRawUnsafe<EmployeeRow[]>(
      `SELECT id, full_name, email, position, roles_json, status, company_id, created_at, deleted_at FROM employees ${whereClause} ORDER BY id DESC`
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
        status: row.status,
        companyId: row.company_id ?? null,
        deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null
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

    const dupActive = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM employees WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
      email
    );
    if (dupActive[0]) {
      res.status(409).json({ message: "Сотрудник с таким email уже существует" });
      return;
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

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Некорректный id сотрудника" });
      return;
    }

    const body: UpdateEmployeeBody = req.body ?? {};
    const hasPatch =
      body.fullName !== undefined ||
      body.email !== undefined ||
      body.position !== undefined ||
      body.roles !== undefined ||
      body.companyId !== undefined ||
      body.status !== undefined;

    if (!hasPatch) {
      res.status(400).json({ message: "Нет данных для обновления" });
      return;
    }

    const rows = await prisma.$queryRawUnsafe<EmployeeRow[]>(
      `SELECT id, full_name, email, position, roles_json, status, company_id, created_at, deleted_at FROM employees WHERE id = ? LIMIT 1`,
      id
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ message: "Сотрудник не найден" });
      return;
    }
    if (row.deleted_at) {
      res.status(409).json({ message: "Нельзя изменить удалённую учётную запись" });
      return;
    }

    let existingRoles: string[] = [];
    try {
      existingRoles = JSON.parse(row.roles_json ?? "[]");
    } catch {
      existingRoles = [];
    }

    const nextFullName = body.fullName !== undefined ? String(body.fullName).trim() : row.full_name;
    const nextPosition = body.position !== undefined ? String(body.position).trim() : row.position;
    let nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : row.email.toLowerCase();
    const nextRoles =
      body.roles !== undefined
        ? body.roles.filter((role) => typeof role === "string" && role.trim())
        : existingRoles;
    let nextCompanyId: number | null = row.company_id;
    if (body.companyId !== undefined) {
      if (body.companyId === null) {
        nextCompanyId = null;
      } else {
        const n = Number(body.companyId);
        if (Number.isNaN(n) || n <= 0) {
          res.status(400).json({ message: "Некорректный companyId" });
          return;
        }
        nextCompanyId = n;
      }
    }

    const nextStatus =
      body.status !== undefined
        ? body.status === "Активен" || body.status === "Неактивен"
          ? body.status
          : null
        : row.status;

    if (!nextFullName || !nextEmail || !nextPosition) {
      res.status(400).json({ message: "Поля fullName, email и position не могут быть пустыми" });
      return;
    }
    if (nextRoles.length === 0) {
      res.status(400).json({ message: "У сотрудника должна быть хотя бы одна роль" });
      return;
    }
    if (nextStatus === null) {
      res.status(400).json({ message: "Некорректный status" });
      return;
    }

    if (rolesIncludeCompanyAdmin(nextRoles) && nextCompanyId === null) {
      res.status(400).json({
        message: "Роль администратора компании (admin) допустима только вместе с привязкой к компании (companyId)"
      });
      return;
    }

    if (row.email === PLATFORM_DEMO_ADMIN_EMAIL) {
      if (body.email !== undefined && nextEmail !== PLATFORM_DEMO_ADMIN_EMAIL) {
        res.status(403).json({ message: "Нельзя сменить email платформенного администратора" });
        return;
      }
      if (body.roles !== undefined && !rolesIncludeCompanyAdmin(nextRoles)) {
        res.status(403).json({ message: "Нельзя снять роль администратора с платформенной учётной записи" });
        return;
      }
      if (body.companyId !== undefined && nextCompanyId !== null) {
        res.status(403).json({ message: "Платформенный администратор не привязывается к компании" });
        return;
      }
      nextCompanyId = null;
    }

    if (nextEmail !== row.email.toLowerCase()) {
      const dup = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT id FROM employees WHERE email = ? AND deleted_at IS NULL AND id <> ? LIMIT 1`,
        nextEmail,
        id
      );
      if (dup[0]) {
        res.status(409).json({ message: "Сотрудник с таким email уже существует" });
        return;
      }
    }

    if (nextEmail === PLATFORM_DEMO_ADMIN_EMAIL && row.email !== PLATFORM_DEMO_ADMIN_EMAIL) {
      res.status(409).json({ message: "Этот email зарезервирован для платформенного администратора" });
      return;
    }

    if (nextCompanyId !== null) {
      const companyExists = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT id FROM companies WHERE id = ? LIMIT 1`,
        nextCompanyId
      );
      if (!companyExists[0]) {
        res.status(404).json({ message: "Компания не найдена" });
        return;
      }
    }

    const runUpdate = async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE employees SET full_name = ?, email = ?, position = ?, roles_json = ?, status = ?, company_id = ? WHERE id = ? AND deleted_at IS NULL`,
        nextFullName,
        nextEmail,
        nextPosition,
        JSON.stringify(nextRoles),
        nextStatus,
        nextCompanyId,
        id
      );
    };

    if (rolesIncludeCompanyAdmin(nextRoles) && nextCompanyId !== null) {
      await prisma.$transaction(async (tx) => {
        const locked = await lockCompanyRowForUpdate(tx, nextCompanyId!);
        if (!locked) {
          throw new Error("COMPANY_NOT_FOUND");
        }
        if ((await countOtherCompanyAdminsTx(tx, nextCompanyId!, id)) > 0) {
          throw new Error("COMPANY_ADMIN_EXISTS");
        }
        await tx.$executeRawUnsafe(
          `UPDATE employees SET full_name = ?, email = ?, position = ?, roles_json = ?, status = ?, company_id = ? WHERE id = ? AND deleted_at IS NULL`,
          nextFullName,
          nextEmail,
          nextPosition,
          JSON.stringify(nextRoles),
          nextStatus,
          nextCompanyId,
          id
        );
      });
    } else {
      await runUpdate();
    }

    logger.info(`✅ Обновлён сотрудник id=${id}`);
    res.json({
      message: "Сотрудник обновлён",
      employee: {
        key: String(id),
        fullName: nextFullName,
        email: nextEmail,
        position: nextPosition,
        roles: nextRoles,
        status: nextStatus,
        companyId: nextCompanyId
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Ошибка обновления сотрудника: ${message}`);

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
      message: "Ошибка обновления сотрудника",
      error: message
    });
  }
}

export async function resetEmployeePassword(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Некорректный id сотрудника" });
      return;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; deleted_at: Date | null }>>(
      `SELECT id, deleted_at FROM employees WHERE id = ? LIMIT 1`,
      id
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ message: "Сотрудник не найден" });
      return;
    }
    if (row.deleted_at) {
      res.status(409).json({ message: "Нельзя сбросить пароль удалённой учётной записи" });
      return;
    }

    const oneTimePassword = generateOneTimePassword();
    const passwordHash = await hashPassword(oneTimePassword);

    await prisma.$transaction(async (tx) => {
      const r = await tx.$queryRawUnsafe<Array<{ deleted_at: Date | null }>>(
        `SELECT deleted_at FROM employees WHERE id = ? LIMIT 1 FOR UPDATE`,
        id
      );
      if (r[0]?.deleted_at) {
        throw new Error("ALREADY_DELETED");
      }
      await tx.$executeRawUnsafe(
        `UPDATE employees SET password_value = ?, is_temporary_password = 1 WHERE id = ? AND deleted_at IS NULL`,
        passwordHash,
        id
      );
      await tx.$executeRawUnsafe(`DELETE FROM auth_sessions WHERE employee_id = ?`, id);
    });

    logger.info(`✅ Сброшен пароль сотрудника id=${id}`);
    res.json({
      message: "Новый одноразовый пароль выдан",
      oneTimePassword
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ALREADY_DELETED")) {
      res.status(409).json({ message: "Нельзя сбросить пароль удалённой учётной записи" });
      return;
    }
    logger.error(`❌ Ошибка сброса пароля сотрудника: ${message}`);
    res.status(500).json({
      message: "Ошибка сброса пароля",
      error: message
    });
  }
}

export async function softDeleteEmployee(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const current = req.authEmployee!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Некорректный id сотрудника" });
      return;
    }

    if (current.id === id) {
      res.status(403).json({ message: "Нельзя удалить собственную учётную запись" });
      return;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; email: string; deleted_at: Date | null }>>(
      `SELECT id, email, deleted_at FROM employees WHERE id = ? LIMIT 1`,
      id
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ message: "Сотрудник не найден" });
      return;
    }
    if (row.deleted_at) {
      res.status(409).json({ message: "Сотрудник уже помечен как удалённый" });
      return;
    }
    if (row.email === PLATFORM_DEMO_ADMIN_EMAIL) {
      res.status(403).json({ message: "Удаление платформенного администратора запрещено" });
      return;
    }

    const newEmail = `deleted.${id}.${Date.now()}@deleted.invalid`;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE employees SET deleted_at = CURRENT_TIMESTAMP(3), email = ? WHERE id = ? AND deleted_at IS NULL`,
        newEmail,
        id
      );
      await tx.$executeRawUnsafe(`DELETE FROM auth_sessions WHERE employee_id = ?`, id);
    });

    logger.info(`✅ Учётная запись сотрудника помечена как удалённая: id=${id}`);
    res.json({ ok: true, id: String(id) });
  } catch (error) {
    logger.error(`❌ Ошибка удаления сотрудника: ${error}`);
    res.status(500).json({
      message: "Ошибка удаления сотрудника",
      error: error instanceof Error ? error.message : error
    });
  }
}
