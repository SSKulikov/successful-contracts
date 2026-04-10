import { Request, Response } from "express";

/**
 * Liveness: процесс отвечает (staging, балансировщики, мониторинг).
 * Без проверки БД/Redis — чтобы health не падал при кратковременной недоступности зависимостей.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: "ok",
    service: "pdf-parser",
    uptimeSeconds: Math.floor(process.uptime())
  });
}
