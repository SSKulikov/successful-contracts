import { NextFunction, Request, Response } from "express";

/**
 * Блокирует mutation-операции для сотрудников с временным паролем.
 * Разблокируется после POST /users/me/change-password.
 */
export function requirePasswordNotTemporary(req: Request, res: Response, next: NextFunction): void {
  const employee = req.authEmployee;
  if (!employee) {
    res.status(401).json({ message: "Сессия не найдена" });
    return;
  }

  if (employee.is_temporary_password === 1) {
    res.status(403).json({
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Смените временный пароль перед выполнением действия"
    });
    return;
  }

  next();
}
