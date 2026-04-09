import { Request, Response } from "express";
import prisma from "../prisma";
import { logger } from "../utils/logger";

type CreateEmployeeBody = {
  fullName?: string;
  email?: string;
  position?: string;
  roles?: string[];
  oneTimePassword?: string;
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

function generateOneTimePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

async function ensureEmployeesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      position VARCHAR(255) NOT NULL,
      roles_json TEXT NOT NULL,
      password_value VARCHAR(255) NOT NULL,
      is_temporary_password TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'Активен',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const passwordColumn = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'employees'
        AND COLUMN_NAME = 'password_value'
    `
  );
  if (Number(passwordColumn[0]?.cnt ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE employees ADD COLUMN password_value VARCHAR(255) NOT NULL DEFAULT ''"
    );
  }

  const temporaryColumn = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'employees'
        AND COLUMN_NAME = 'is_temporary_password'
    `
  );
  if (Number(temporaryColumn[0]?.cnt ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE employees ADD COLUMN is_temporary_password TINYINT(1) NOT NULL DEFAULT 1"
    );
  }
}

export async function ensureAuthSessionsTable() {
  await ensureEmployeesTable();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token VARCHAR(255) NOT NULL PRIMARY KEY,
      employee_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_auth_sessions_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);
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
      "INSERT INTO employees (full_name, email, position, roles_json, password_value, is_temporary_password, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      fullName,
      email,
      position,
      JSON.stringify(roles),
      oneTimePassword,
      1,
      "Активен"
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
