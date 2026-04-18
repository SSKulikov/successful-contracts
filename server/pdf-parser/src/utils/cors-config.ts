import type { CorsOptions } from "cors";

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** RFC1918 + loopback: удобно для WSL/Vite «Network» без перечисления IP в CORS_ORIGIN. */
function isPrivateLanIPv4(hostname: string): boolean {
  const parts = hostname.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isAllowedDevLanOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isLoopbackHostname(u.hostname)) return true;
    return isPrivateLanIPv4(u.hostname);
  } catch {
    return false;
  }
}

/** Для каждого `http://localhost:PORT` добавляет `http://127.0.0.1:PORT` и наоборот (разные origin в браузере). */
function expandLocalhostOrigins(origins: string[]): string[] {
  const out = new Set(origins);
  for (const o of origins) {
    try {
      const u = new URL(o);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const port = u.port ? `:${u.port}` : "";
      if (u.hostname === "localhost") {
        out.add(`${u.protocol}//127.0.0.1${port}`);
      } else if (u.hostname === "127.0.0.1") {
        out.add(`${u.protocol}//localhost${port}`);
      }
    } catch {
      // не URL — пропускаем
    }
  }
  return [...out];
}

/**
 * Разрешённые origin из `CORS_ORIGIN` (один URL или несколько через запятую).
 * Если переменная не задана и нет `CORS_ALLOW_LAN_ORIGINS` — как у `cors()` без опций (любой origin).
 *
 * `CORS_ALLOW_LAN_ORIGINS=1` — дополнительно разрешить `http(s)://` с localhost, 127.0.0.1 и частными IPv4
 * (10/8, 172.16–31, 192.168/16). Удобно при доступе к Vite по IP из строки Network (WSL и т.п.).
 * В production не включайте без осознанной необходимости.
 */
export function getCorsOptions(): CorsOptions {
  const raw = process.env.CORS_ORIGIN?.trim();
  const allowLan = process.env.CORS_ALLOW_LAN_ORIGINS?.trim() === "1";

  if (!raw && !allowLan) {
    return { origin: true };
  }

  const allowlist = raw
    ? expandLocalhostOrigins(raw.split(",").map((s) => s.trim()).filter(Boolean))
    : [];

  if (allowLan) {
    return {
      origin: (origin, cb) => {
        if (!origin) {
          cb(null, true);
          return;
        }
        if (allowlist.includes(origin)) {
          cb(null, origin);
          return;
        }
        if (isAllowedDevLanOrigin(origin)) {
          cb(null, origin);
          return;
        }
        cb(null, false);
      }
    };
  }

  const origins = allowlist;
  return {
    origin: origins.length === 1 ? origins[0] : origins
  };
}
