import { Request, Response } from "express";
import prisma from "../prisma";
import { logger } from "../utils/logger";
import { ensureNotificationTables } from "../services/NotificationService";

function parsePage(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function notificationCompanyWhereSql(): string {
  return "((? IS NULL AND n.company_id IS NULL) OR n.company_id = ?)";
}

export async function listNotifications(req: Request, res: Response): Promise<void> {
  try {
    await ensureNotificationTables();
    const employee = req.authContext!;
    const page = parsePage(req.query.page, 1, 10_000);
    const pageSize = parsePage(req.query.page_size, 20, 100);
    const offset = (page - 1) * pageSize;

    const whereClause = `WHERE n.recipient_employee_id = ? AND ${notificationCompanyWhereSql()}`;
    const whereValues: Array<number | null> = [employee.id, employee.companyId, employee.companyId];

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
      `SELECT COUNT(*) AS total FROM approval_notifications n ${whereClause}`,
      ...whereValues
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        document_id: number | null;
        event_type: string;
        title: string;
        body: string | null;
        read_at: Date | null;
        created_at: Date;
      }>
    >(
      `
        SELECT n.id, n.document_id, n.event_type, n.title, n.body, n.read_at, n.created_at
        FROM approval_notifications n
        ${whereClause}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ?
        OFFSET ?
      `,
      ...whereValues,
      pageSize,
      offset
    );

    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        documentId: r.document_id != null ? String(r.document_id) : null,
        eventType: r.event_type,
        title: r.title,
        body: r.body,
        read: r.read_at != null,
        createdAt: r.created_at.toISOString()
      })),
      meta: { page, pageSize, total }
    });
  } catch (error) {
    logger.error(`❌ Ошибка списка уведомлений: ${error}`);
    res.status(500).json({ message: "Ошибка получения уведомлений" });
  }
}

export async function getUnreadNotificationsCount(req: Request, res: Response): Promise<void> {
  try {
    await ensureNotificationTables();
    const employee = req.authContext!;
    const whereClause = `WHERE n.recipient_employee_id = ? AND n.read_at IS NULL AND ${notificationCompanyWhereSql()}`;
    const whereValues: Array<number | null> = [employee.id, employee.companyId, employee.companyId];

    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM approval_notifications n ${whereClause}`,
      ...whereValues
    );
    const count = Number(rows[0]?.c ?? 0);
    res.json({ count });
  } catch (error) {
    logger.error(`❌ Ошибка счётчика уведомлений: ${error}`);
    res.status(500).json({ message: "Ошибка получения счётчика уведомлений" });
  }
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  try {
    await ensureNotificationTables();
    const employee = req.authContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Некорректный id уведомления" });
      return;
    }

    const result = await prisma.$executeRawUnsafe(
      `
        UPDATE approval_notifications
        SET read_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?
          AND recipient_employee_id = ?
          AND ((? IS NULL AND company_id IS NULL) OR company_id = ?)
      `,
      id,
      employee.id,
      employee.companyId,
      employee.companyId
    );

    if (Number(result) === 0) {
      res.status(404).json({ message: "Уведомление не найдено" });
      return;
    }

    res.json({ ok: true, id: String(id) });
  } catch (error) {
    logger.error(`❌ Ошибка отметки уведомления: ${error}`);
    res.status(500).json({ message: "Ошибка отметки уведомления прочитанным" });
  }
}
