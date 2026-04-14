import { NextFunction, Request, Response } from "express";
import {
  employeeRowToAuthContext,
  getBearerToken,
  isPlatformAdministrator
} from "../utils/auth-context";
import { getEmployeeByAuthToken } from "../utils/auth-token";

/**
 * Доступ только платформенному администратору (`company_id` IS NULL и роль admin).
 * После `requireAuth` повторный запрос к БД не выполняется.
 */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  let row = req.authEmployee;
  if (!row) {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ message: "Требуется авторизация" });
      return;
    }
    const loaded = await getEmployeeByAuthToken(token);
    if (!loaded) {
      res.status(401).json({ message: "Сессия не найдена или недействительна" });
      return;
    }
    req.authEmployee = loaded;
    req.authContext = employeeRowToAuthContext(loaded);
    row = loaded;
  }

  const ctx = req.authContext ?? employeeRowToAuthContext(row);
  if (!req.authContext) {
    req.authContext = ctx;
  }

  if (!isPlatformAdministrator(ctx)) {
    res.status(403).json({ message: "Доступно только платформенному администратору" });
    return;
  }

  next();
}
