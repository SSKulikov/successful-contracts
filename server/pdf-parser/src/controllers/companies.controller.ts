import { Request, Response } from "express";
import prisma from "../prisma";
import { ensureEmployeesTable, generateOneTimePassword } from "./admin.controller";
import { logger } from "../utils/logger";

type CompanyListRow = {
  id: number;
  name: string;
  inn: string;
  admin_full_name: string | null;
  admin_employee_id: number | null;
};

function adminRoleCondition(alias = "") {
  const p = alias ? `${alias}.` : "";
  return `JSON_CONTAINS(CAST(${p}roles_json AS JSON), '"admin"', '$')`;
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
          WHERE e.company_id = c.id AND ${adminRoleCondition("e")}
          ORDER BY e.id ASC
          LIMIT 1
        ) AS admin_full_name,
        (
          SELECT e.id
          FROM employees e
          WHERE e.company_id = c.id AND ${adminRoleCondition("e")}
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

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO companies (name, inn) VALUES (?, ?)`, companyName, inn);

      const inserted = await tx.$queryRawUnsafe<Array<{ id: bigint }>>(`SELECT LAST_INSERT_ID() AS id`);
      const companyId = Number(inserted[0]?.id ?? 0);
      if (!companyId) {
        throw new Error("Не удалось получить id компании");
      }

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
        password,
        0,
        "Активен",
        companyId
      );
    });

    logger.info(`✅ Зарегистрирована компания: ${inn}`);
    res.status(201).json({ message: "Компания зарегистрирована" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Ошибка регистрации компании: ${message}`);

    if (message.includes("Duplicate entry") && message.includes("inn")) {
      res.status(409).json({ message: "Компания с таким ИНН уже зарегистрирована" });
      return;
    }
    if (message.includes("Duplicate entry") && message.includes("email")) {
      res.status(409).json({ message: "Пользователь с таким email уже существует" });
      return;
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

    await prisma.$executeRawUnsafe(`UPDATE companies SET name = ?, inn = ? WHERE id = ?`, companyName, inn, id);

    await prisma.$executeRawUnsafe(
      `
      UPDATE employees
      SET full_name = ?
      WHERE company_id = ? AND ${adminRoleCondition()}
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

export async function resetCompanyAdmin(req: Request, res: Response): Promise<void> {
  try {
    await ensureEmployeesTable();

    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "Некорректный id компании" });
      return;
    }

    const oneTimePassword = generateOneTimePassword();

    const adminRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `
      SELECT id FROM employees
      WHERE company_id = ? AND ${adminRoleCondition()}
      LIMIT 1
      `,
      id
    );
    if (!adminRows[0]) {
      res.status(404).json({ message: "Администратор компании не найден" });
      return;
    }

    await prisma.$executeRawUnsafe(
      `
      UPDATE employees
      SET password_value = ?, is_temporary_password = 1
      WHERE company_id = ? AND ${adminRoleCondition()}
      `,
      oneTimePassword,
      id
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
