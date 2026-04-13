import { randomUUID } from "crypto";
import { Request, Response } from "express";
import prisma from "../prisma";
import { ensureAuthSessionsTable } from "./admin.controller";
import { logger } from "../utils/logger";

type EmployeeAccountRow = {
  id: number;
  full_name: string;
  email: string;
  position: string;
  roles_json: string;
  password_value: string;
  is_temporary_password: 0 | 1;
  status: "Активен" | "Неактивен";
  company_id: number | null;
};

function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

async function getEmployeeByToken(token: string): Promise<EmployeeAccountRow | null> {
  const rows = await prisma.$queryRawUnsafe<EmployeeAccountRow[]>(
    `
      SELECT e.id, e.full_name, e.email, e.position, e.roles_json, e.password_value, e.is_temporary_password, e.status, e.company_id
      FROM auth_sessions s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.token = ?
      LIMIT 1
    `,
    token
  );
  return rows[0] ?? null;
}

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
    role: isAdmin ? ("admin" as const) : ("employee" as const)
  };
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

    if (!employee || employee.password_value !== password) {
      res.status(401).json({ message: "Неверный email или пароль" });
      return;
    }

    if (employee.status !== "Активен") {
      res.status(403).json({ message: "Пользователь неактивен" });
      return;
    }

    const token = randomUUID();
    await prisma.$executeRawUnsafe("INSERT INTO auth_sessions (token, employee_id) VALUES (?, ?)", token, employee.id);

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
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ message: "Отсутствует токен авторизации" });
      return;
    }

    const employee = await getEmployeeByToken(token);
    if (!employee) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

    res.json(mapEmployeeProfile(employee));
  } catch (error) {
    logger.error(`❌ Ошибка получения профиля: ${error}`);
    res.status(500).json({ message: "Ошибка получения профиля" });
  }
}

export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ message: "Отсутствует токен авторизации" });
      return;
    }

    const currentEmployee = await getEmployeeByToken(token);
    if (!currentEmployee) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

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
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ message: "Отсутствует токен авторизации" });
      return;
    }

    const employee = await getEmployeeByToken(token);
    if (!employee) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: "Текущий и новый пароль обязательны" });
      return;
    }

    if (employee.password_value !== currentPassword) {
      res.status(400).json({ message: "Текущий пароль указан неверно" });
      return;
    }

    await prisma.$executeRawUnsafe(
      "UPDATE employees SET password_value = ?, is_temporary_password = 0 WHERE id = ?",
      newPassword,
      employee.id
    );

    res.json({ message: "Пароль обновлен" });
  } catch (error) {
    logger.error(`❌ Ошибка смены пароля: ${error}`);
    res.status(500).json({ message: "Ошибка смены пароля" });
  }
}
