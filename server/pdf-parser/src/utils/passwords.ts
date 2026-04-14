import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export function isBcryptHash(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith("$2");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Проверка: bcrypt или legacy plaintext в БД. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

/**
 * Успешная проверка пароля. Если в БД ещё plaintext — возвращает bcrypt для записи в MySQL и Redis.
 */
export async function verifyPasswordOrMigrate(
  plain: string,
  stored: string
): Promise<{ ok: false } | { ok: true; bcryptHash: string }> {
  const ok = await verifyPassword(plain, stored);
  if (!ok) {
    return { ok: false };
  }
  if (isBcryptHash(stored)) {
    return { ok: true, bcryptHash: stored };
  }
  return { ok: true, bcryptHash: await hashPassword(plain) };
}
