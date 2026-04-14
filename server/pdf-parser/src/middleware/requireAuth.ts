import { NextFunction, Request, Response } from "express";
import { employeeRowToAuthContext, getBearerToken } from "../utils/auth-context";
import { getEmployeeByAuthToken } from "../utils/auth-token";

/**
 * Проверяет Bearer-токен (JWT или legacy-сессия), подгружает сотрудника из БД.
 * Заполняет `req.authEmployee` и `req.authContext`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Отсутствует токен авторизации" });
    return;
  }

  const row = await getEmployeeByAuthToken(token);
  if (!row) {
    res.status(401).json({ message: "Сессия не найдена" });
    return;
  }

  req.authEmployee = row;
  req.authContext = employeeRowToAuthContext(row);
  next();
}
