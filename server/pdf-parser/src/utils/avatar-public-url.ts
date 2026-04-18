import type { Request } from "express";

/**
 * Абсолютный URL картинки для `<img src>` (SPA на другом origin, чем API).
 * Файлы отдаёт этот же процесс (`/api/avatars`), поэтому базу берём с **Host запроса к API**
 * (и `X-Forwarded-*` за прокси). `PUBLIC_APP_URL` часто указывают на origin Vite без прокси `/api` —
 * тогда ссылка вида `${PUBLIC_APP_URL}/api/avatars/...` даёт 404 и аватар в UI не появляется.
 */
export function resolveAvatarPublicUrl(req: Request, storedFilename: string | null | undefined): string | null {
  if (!storedFilename || storedFilename.includes("/") || storedFilename.includes("..")) {
    return null;
  }

  const forwardedProto = req.get("x-forwarded-proto");
  const host = req.get("x-forwarded-host") ?? req.get("host");
  if (host) {
    const proto = forwardedProto ?? (req.secure ? "https" : "http");
    return `${proto}://${host}/api/avatars/${encodeURIComponent(storedFilename)}`;
  }

  const publicBase = process.env.PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  if (publicBase) {
    return `${publicBase}/api/avatars/${encodeURIComponent(storedFilename)}`;
  }

  return null;
}
