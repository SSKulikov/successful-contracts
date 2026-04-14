import { Request, Response } from "express";
import prisma from "../prisma";
import type { EmployeeAccountRow } from "../types/employee-account";
import { signAccessToken } from "../utils/jwt";
import { hashPassword, verifyPasswordOrMigrate } from "../utils/passwords";
import { ensureAuthSessionsTable } from "./admin.controller";
import { logger } from "../utils/logger";

/** DTO пользователя для login / GET/PATCH /users/me */
export function mapEmployeeProfile(row: EmployeeAccountRow) {
  let roles: string[] = [];
  try {
    roles = JSON.parse(row.roles_json ?? "[]");
  } catch {
    roles = [];
  }

  const isAdmin = roles.includes("admin");
  const roleLabel = isAdmin ? "Администратор" : "Сотрудник";
  return {
    fullName: row.full_name,
    email: row.email,
    position: row.position,
    roleLabel,
    companyId: row.company_id,
    role: isAdmin ? ("admin" as const) : ("employee" as const),
    /** Согласовано с `isTemporaryPassword` на login: нужно сменить пароль после одноразового. */
    mustChangePassword: row.is_temporary_password === 1
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
        SELECT id, full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id
        FROM employees
        WHERE email = ?
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
      user: mapEmployeeProfile(employee)
    });
  } catch (error) {
    logger.error(`❌ Ошибка входа сотрудника: ${error}`);
    res.status(500).json({ message: "Ошибка входа" });
  }
}

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const employee = req.authEmployee!;
    res.json(mapEmployeeProfile(employee));
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

    const rows = await prisma.$queryRawUnsafe<EmployeeAccountRow[]>(
      `
        SELECT id, full_name, email, position, roles_json, password_value, is_temporary_password, status, company_id
        FROM employees
        WHERE id = ?
        LIMIT 1
      `,
      currentEmployee.id
    );
    const updated = rows[0];
    if (!updated) {
      res.status(500).json({ message: "Не удалось загрузить профиль после обновления" });
      return;
    }

    res.json(mapEmployeeProfile(updated));
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
