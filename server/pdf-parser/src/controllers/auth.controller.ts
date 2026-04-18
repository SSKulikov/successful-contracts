import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import prisma from "../prisma";
import type { EmployeeAccountRow } from "../types/employee-account";
import { getAvatarsRoot } from "../middleware/uploadAvatar";
import { resolveAvatarPublicUrl } from "../utils/avatar-public-url";
import { signAccessToken } from "../utils/jwt";
import { hashPassword, verifyPasswordOrMigrate } from "../utils/passwords";
import { ensureAuthSessionsTable } from "./admin.controller";
import { logger } from "../utils/logger";

/** Имя/ИНН компании: драйверы иногда отдают ключи как `company_name`, иногда как `companyName`. */
function companyDisplayFields(row: EmployeeAccountRow): { companyName: string | null; companyInn: string | null } {
  const r = row as unknown as Record<string, unknown>;
  const nameRaw = r.company_name ?? r.companyName;
  const innRaw = r.company_inn ?? r.companyInn;
  const name = nameRaw != null && String(nameRaw).trim() !== "" ? String(nameRaw).trim() : null;
  const inn = innRaw != null && String(innRaw).trim() !== "" ? String(innRaw).trim() : null;
  return { companyName: name, companyInn: inn };
}

const EMPLOYEE_ACCOUNT_BY_ID_SQL = `
  SELECT
    e.id,
    e.full_name,
    e.email,
    e.position,
    e.roles_json,
    e.password_value,
    e.is_temporary_password,
    e.status,
    e.company_id,
    e.deleted_at,
    e.avatar_url,
    c.name AS company_name,
    c.inn AS company_inn
  FROM employees e
  LEFT JOIN companies c ON c.id = e.company_id
  WHERE e.id = ? AND e.deleted_at IS NULL
  LIMIT 1
`;

/** Актуальная строка сотрудника с названием компании (для профиля, если JOIN в сессии не отдал поля). */
async function fetchEmployeeAccountById(employeeId: number): Promise<EmployeeAccountRow | null> {
  const rows = await prisma.$queryRawUnsafe<EmployeeAccountRow[]>(EMPLOYEE_ACCOUNT_BY_ID_SQL, employeeId);
  let row = rows[0];
  if (!row) return null;

  const { companyName } = companyDisplayFields(row);
  if (row.company_id && !companyName) {
    const c = await prisma.$queryRawUnsafe<Array<{ name: string; inn: string | null }>>(
      `SELECT name, inn FROM companies WHERE id = ? LIMIT 1`,
      row.company_id
    );
    if (c[0]) {
      row = { ...row, company_name: c[0].name, company_inn: c[0].inn ?? row.company_inn ?? null };
    }
  }
  return row;
}

/** DTO пользователя для login / GET/PATCH /users/me */
export function mapEmployeeProfile(row: EmployeeAccountRow, req: Request) {
  let roles: string[] = [];
  try {
    roles = JSON.parse(row.roles_json ?? "[]");
  } catch {
    roles = [];
  }

  const isAdmin = roles.includes("admin");
  const roleLabel = isAdmin ? "Администратор" : "Сотрудник";
  const { companyName, companyInn } = companyDisplayFields(row);
  return {
    fullName: row.full_name,
    email: row.email,
    position: row.position,
    roleLabel,
    companyId: row.company_id,
    companyName,
    companyInn,
    role: isAdmin ? ("admin" as const) : ("employee" as const),
    /** Согласовано с `isTemporaryPassword` на login: нужно сменить пароль после одноразового. */
    mustChangePassword: row.is_temporary_password === 1,
    avatarUrl: resolveAvatarPublicUrl(req, row.avatar_url ?? null)
  };
}

function appRoleFromRow(row: EmployeeAccountRow): "admin" | "employee" {
  let roles: string[] = [];
  try {
    roles = JSON.parse(row.roles_json ?? "[]");
  } catch {
    roles = [];
  }
  return roles.includes("admin") ? "admin" : "employee";
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    await ensureAuthSessionsTable();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      res.status(400).json({ message: "Email и пароль обязательны" });
      return;
    }

    const rows = await prisma.$queryRawUnsafe<EmployeeAccountRow[]>(
      `
        SELECT
          e.id,
          e.full_name,
          e.email,
          e.position,
          e.roles_json,
          e.password_value,
          e.is_temporary_password,
          e.status,
          e.company_id,
          e.deleted_at,
          e.avatar_url,
          c.name AS company_name,
          c.inn AS company_inn
        FROM employees e
        LEFT JOIN companies c ON c.id = e.company_id
        WHERE e.email = ? AND e.deleted_at IS NULL
        LIMIT 1
      `,
      email
    );
    const employee = rows[0];

    if (!employee) {
      res.status(401).json({ message: "Неверный email или пароль" });
      return;
    }

    const authResult = await verifyPasswordOrMigrate(password, employee.password_value);
    if (!authResult.ok) {
      res.status(401).json({ message: "Неверный email или пароль" });
      return;
    }

    if (authResult.bcryptHash !== employee.password_value) {
      await prisma.$executeRawUnsafe(
        "UPDATE employees SET password_value = ? WHERE id = ?",
        authResult.bcryptHash,
        employee.id
      );
    }

    if (employee.status !== "Активен") {
      res.status(403).json({ message: "Пользователь неактивен" });
      return;
    }

    const role = appRoleFromRow(employee);
    const token = signAccessToken({
      employeeId: employee.id,
      companyId: employee.company_id ?? null,
      role
    });

    res.json({
      token,
      isTemporaryPassword: employee.is_temporary_password === 1,
      user: mapEmployeeProfile(employee, req)
    });
  } catch (error) {
    logger.error(`❌ Ошибка входа сотрудника: ${error}`);
    res.status(500).json({ message: "Ошибка входа" });
  }
}

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const employeeId = req.authEmployee!.id;
    const row = await fetchEmployeeAccountById(employeeId);
    if (!row) {
      res.status(401).json({ message: "Сессия недействительна" });
      return;
    }
    res.json(mapEmployeeProfile(row, req));
  } catch (error) {
    logger.error(`❌ Ошибка получения профиля: ${error}`);
    res.status(500).json({ message: "Ошибка получения профиля" });
  }
}

export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const currentEmployee = req.authEmployee!;

    const fullName = String(req.body?.fullName ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();

    if (!fullName || !email) {
      res.status(400).json({ message: "Поля fullName и email обязательны" });
      return;
    }

    await prisma.$executeRawUnsafe("UPDATE employees SET full_name = ?, email = ? WHERE id = ?", fullName, email, currentEmployee.id);

    const updated = await fetchEmployeeAccountById(currentEmployee.id);
    if (!updated) {
      res.status(500).json({ message: "Не удалось загрузить профиль после обновления" });
      return;
    }

    res.json(mapEmployeeProfile(updated, req));
  } catch (error) {
    logger.error(`❌ Ошибка обновления профиля: ${error}`);
    res.status(500).json({ message: "Ошибка обновления профиля" });
  }
}

export async function changeMyPassword(req: Request, res: Response): Promise<void> {
  try {
    const employee = req.authEmployee!;

    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: "Текущий и новый пароль обязательны" });
      return;
    }

    const cur = await verifyPasswordOrMigrate(currentPassword, employee.password_value);
    if (!cur.ok) {
      res.status(400).json({ message: "Текущий пароль указан неверно" });
      return;
    }

    if (cur.bcryptHash !== employee.password_value) {
      await prisma.$executeRawUnsafe("UPDATE employees SET password_value = ? WHERE id = ?", cur.bcryptHash, employee.id);
    }

    const newHash = await hashPassword(newPassword);
    await prisma.$executeRawUnsafe(
      "UPDATE employees SET password_value = ?, is_temporary_password = 0 WHERE id = ?",
      newHash,
      employee.id
    );

    res.json({ message: "Пароль обновлен" });
  } catch (error) {
    logger.error(`❌ Ошибка смены пароля: ${error}`);
    res.status(500).json({ message: "Ошибка смены пароля" });
  }
}

export async function uploadMyAvatar(req: Request, res: Response): Promise<void> {
  try {
    const employee = req.authEmployee!;
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "Добавьте файл в поле формы avatar" });
      return;
    }

    const prev = await prisma.$queryRawUnsafe<Array<{ avatar_url: string | null }>>(
      `SELECT avatar_url FROM employees WHERE id = ? LIMIT 1`,
      employee.id
    );
    const oldName = prev[0]?.avatar_url ?? null;

    await prisma.$executeRawUnsafe(`UPDATE employees SET avatar_url = ? WHERE id = ?`, file.filename, employee.id);

    if (oldName && oldName !== file.filename && !oldName.includes("/") && !oldName.includes("..")) {
      try {
        fs.unlinkSync(path.join(getAvatarsRoot(), oldName));
      } catch {
        // файл уже отсутствует
      }
    }

    const updated = await fetchEmployeeAccountById(employee.id);
    if (!updated) {
      res.status(500).json({ message: "Не удалось прочитать профиль" });
      return;
    }

    res.json(mapEmployeeProfile(updated, req));
  } catch (error) {
    logger.error(`❌ Ошибка загрузки аватара: ${error}`);
    res.status(500).json({ message: "Ошибка загрузки аватара" });
  }
}
