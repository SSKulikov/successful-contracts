import jwt, { type SignOptions } from "jsonwebtoken";

/**
 * Подписанный access-токен: `sub` = id сотрудника, в payload — companyId и роль приложения.
 * Авторизация на сервере всё равно опирается на актуальные данные из БД после проверки подписи.
 */
export type AccessTokenPayload = {
  employeeId: number;
  companyId: number | null;
  role: "admin" | "employee";
};

function jwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "dev-jwt-secret-change-me";
}

export function signAccessToken(p: AccessTokenPayload): string {
  const options: SignOptions = {
    subject: String(p.employeeId),
    expiresIn: (process.env.JWT_EXPIRES_IN?.trim() || "7d") as SignOptions["expiresIn"]
  };
  return jwt.sign({ companyId: p.companyId, role: p.role }, jwtSecret(), options);
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret()) as jwt.JwtPayload & {
      companyId?: unknown;
      role?: unknown;
    };
    if (decoded.sub === undefined || decoded.sub === null) return null;
    const employeeId = Number(decoded.sub);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return null;

    let companyId: number | null = null;
    if (decoded.companyId !== undefined && decoded.companyId !== null) {
      const n = Number(decoded.companyId);
      companyId = Number.isFinite(n) ? n : null;
    }

    const role = decoded.role === "admin" ? "admin" : "employee";

    return { employeeId, companyId, role };
  } catch {
    return null;
  }
}
