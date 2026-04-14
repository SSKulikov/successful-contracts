import { Request } from "express";
import { getEmployeeByAuthToken } from "./auth-token";

export type EmployeeAuthContext = {
  id: number;
  fullName: string;
  companyId: number | null;
  role: "admin" | "employee";
};

export function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function resolveEmployeeContextByToken(token: string): Promise<EmployeeAuthContext | null> {
  const employee = await getEmployeeByAuthToken(token);
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

/** Управление тенантами и глобальным списком сотрудников — только у учётки без `company_id`. */
export function isPlatformAdministrator(ctx: EmployeeAuthContext): boolean {
  return ctx.role === "admin" && ctx.companyId === null;
}
