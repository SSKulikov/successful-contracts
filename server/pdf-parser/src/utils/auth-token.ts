import prisma from "../prisma";
import type { EmployeeAccountRow } from "../types/employee-account";
import { verifyAccessToken } from "./jwt";

const EMPLOYEE_BY_ID_SQL = `
  SELECT e.id, e.full_name, e.email, e.position, e.roles_json, e.password_value, e.is_temporary_password, e.status, e.company_id
  FROM employees e
  WHERE e.id = ?
  LIMIT 1
`;

/**
 * JWT (подпись + `sub`) или legacy-строка из таблицы `auth_sessions`.
 * Контекст для прав доступа берётся из актуальной строки `employees`.
 */
export async function getEmployeeByAuthToken(token: string): Promise<EmployeeAccountRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const payload = verifyAccessToken(trimmed);
  if (payload) {
    const rows = await prisma.$queryRawUnsafe<EmployeeAccountRow[]>(EMPLOYEE_BY_ID_SQL, payload.employeeId);
    const e = rows[0];
    if (!e || e.status !== "Активен") return null;
    return e;
  }

  const legacy = await prisma.$queryRawUnsafe<EmployeeAccountRow[]>(
    `
      SELECT e.id, e.full_name, e.email, e.position, e.roles_json, e.password_value, e.is_temporary_password, e.status, e.company_id
      FROM auth_sessions s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.token = ?
      LIMIT 1
    `,
    trimmed
  );
  return legacy[0] ?? null;
}
