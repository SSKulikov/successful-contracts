import { Request } from "express";
import prisma from "../prisma";

export type EmployeeAuthContext = {
  id: number;
  fullName: string;
  companyId: number | null;
  role: "admin" | "employee";
};

let employeesHasCompanyId: boolean | null = null;

export function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

async function ensureEmployeesCompanyIdColumnKnown() {
  if (employeesHasCompanyId !== null) return employeesHasCompanyId;

  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'employees'
        AND COLUMN_NAME = 'company_id'
    `
  );

  employeesHasCompanyId = Number(rows[0]?.cnt ?? 0) > 0;
  return employeesHasCompanyId;
}

export async function resolveEmployeeContextByToken(token: string): Promise<EmployeeAuthContext | null> {
  const hasCompanyId = await ensureEmployeesCompanyIdColumnKnown();
  const selectCompanyId = hasCompanyId ? "e.company_id" : "NULL";

  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; full_name: string; roles_json: string; company_id: number | null }>>(
    `
      SELECT e.id, e.full_name, e.roles_json, ${selectCompanyId} AS company_id
      FROM auth_sessions s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.token = ?
      LIMIT 1
    `,
    token
  );

  const employee = rows[0];
  if (!employee) return null;

  let roles: string[] = [];
  try {
    roles = JSON.parse(employee.roles_json ?? "[]");
  } catch {
    roles = [];
  }

  return {
    id: employee.id,
    fullName: employee.full_name,
    companyId: employee.company_id ?? null,
    role: roles.includes("admin") ? "admin" : "employee"
  };
}

