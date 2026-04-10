import type { CorsOptions } from "cors";

/**
 * Разрешённые origin из `CORS_ORIGIN` (один URL или несколько через запятую).
 * Если переменная не задана — поведение как у `cors()` без опций (любой origin).
 */
export function getCorsOptions(): CorsOptions {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return { origin: true };
  }

  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    origin: origins.length === 1 ? origins[0] : origins
  };
}
