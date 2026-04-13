import { NextFunction, Request, Response } from "express";
import { getBearerToken, isPlatformAdministrator, resolveEmployeeContextByToken } from "../utils/auth-context";

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Требуется авторизация" });
    return;
  }

  const ctx = await resolveEmployeeContextByToken(token);
  if (!ctx) {
    res.status(401).json({ message: "Сессия не найдена или недействительна" });
    return;
  }

  if (!isPlatformAdministrator(ctx)) {
    res.status(403).json({ message: "Доступно только платформенному администратору" });
    return;
  }

  next();
}
