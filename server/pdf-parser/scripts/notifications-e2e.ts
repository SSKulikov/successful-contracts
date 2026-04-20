/**
 * E2E: notifications API + доменные вставки уведомлений
 *
 * Проверяет:
 * - /notifications/unread-count
 * - /notifications
 * - /notifications/:id/read
 * - вставки уведомлений в ключевых событиях:
 *   1) document_submitted (для 1-го согласующего),
 *   2) approval_step_assigned (для следующего согласующего),
 *   3) document_rejected (для инициатора)
 *
 * Переменные окружения:
 * - STAGING_API_URL
 * - STAGING_EMAIL / STAGING_PASSWORD       (инициатор A)
 * - STAGING_EMAIL_B / STAGING_PASSWORD_B   (согласующий B, шаг 1)
 * - STAGING_EMAIL_C / STAGING_PASSWORD_C   (согласующий C, шаг 2)
 * - STAGING_COMPANY_ID                     (опционально, если A — платформенный админ)
 */

import assert from "node:assert/strict";

type NotificationItem = {
  id: string;
  documentId: string | null;
  eventType: string;
  read: boolean;
  title: string;
};

const json = (r: Response) => r.json() as Promise<unknown>;

function decodeJwtSubjectEmployeeId(token: string): number {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Некорректный JWT");
  const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { sub?: string };
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) throw new Error("JWT sub (employee id) отсутствует или неверный");
  return id;
}

async function login(base: string, email: string, password: string): Promise<string> {
  const r = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const raw = await r.text();
  assert.equal(r.status, 200, `login ${email}: ${r.status} ${raw}`);
  const data = raw ? (JSON.parse(raw) as { token?: string }) : {};
  assert.ok(data.token, "token in login response");
  return data.token!;
}

async function loginOrThrow(base: string, label: "A" | "B" | "C", email: string, password: string): Promise<string> {
  try {
    const token = await login(base, email, password);
    console.log(`[notifications-e2e] Login ${label} OK (${email})`);
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[notifications-e2e] Login ${label} failed (${email}): ${message}`);
  }
}

async function api(
  base: string,
  token: string,
  path: string,
  init?: RequestInit & { expect?: number }
): Promise<Response> {
  const expectStatus = init?.expect ?? 200;
  const { expect: _e, ...rest } = init ?? {};
  const r = await fetch(`${base}${path}`, {
    ...rest,
    headers: {
      ...(rest.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`
    }
  });
  assert.equal(
    r.status,
    expectStatus,
    `${rest.method ?? "GET"} ${path}: expected ${expectStatus}, got ${r.status}: ${await r.clone().text()}`
  );
  return r;
}

function sampleDocumentPayload(suffix: string) {
  const row: Record<string, unknown> = {
    type: "Договор",
    number: `E2E-NOTIF-${suffix}`,
    date: "2026-04-20",
    customerName: "ООО Заказчик",
    customerInn: "7700000000",
    executorName: "ООО Исполнитель",
    executorInn: "7800000000",
    amount: 5400,
    subject: "Проверка notifications e2e",
    note: ""
  };
  const cidRaw = process.env.STAGING_COMPANY_ID?.trim();
  if (cidRaw) {
    const cid = Number(cidRaw);
    if (Number.isInteger(cid) && cid > 0) row.companyId = cid;
  }
  return row;
}

async function unreadCount(base: string, token: string): Promise<number> {
  const r = await api(base, token, "/notifications/unread-count");
  const data = (await json(r)) as { count?: number };
  return Number(data.count ?? 0);
}

async function listNotifications(base: string, token: string): Promise<NotificationItem[]> {
  const r = await api(base, token, "/notifications?page=1&page_size=50");
  const data = (await json(r)) as { items?: NotificationItem[] };
  return data.items ?? [];
}

async function findTaskIdForDocument(base: string, token: string, documentId: string): Promise<string | null> {
  const r = await api(base, token, "/approvals/my?page=1&page_size=50");
  const data = (await json(r)) as { items?: Array<{ id: string; documentId?: string }> };
  const hit = (data.items ?? []).find((x) => String(x.documentId ?? "") === String(documentId));
  return hit?.id ?? null;
}

async function waitForNotification(
  base: string,
  token: string,
  docId: string,
  eventType: string,
  timeoutMs = 5000
): Promise<NotificationItem> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const items = await listNotifications(base, token);
    const hit = items.find((n) => n.documentId === docId && n.eventType === eventType);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Не дождались уведомления eventType=${eventType} для documentId=${docId}`);
}

async function main() {
  const base = (process.env.STAGING_API_URL ?? "").replace(/\/+$/, "");
  const emailA = process.env.STAGING_EMAIL?.trim();
  const passwordA = process.env.STAGING_PASSWORD?.trim();
  const emailB = process.env.STAGING_EMAIL_B?.trim();
  const passwordB = process.env.STAGING_PASSWORD_B?.trim();
  const emailC = process.env.STAGING_EMAIL_C?.trim();
  const passwordC = process.env.STAGING_PASSWORD_C?.trim();

  if (!base || !emailA || !passwordA || !emailB || !passwordB || !emailC || !passwordC) {
    console.log("[notifications-e2e] SKIP: задайте STAGING_API_URL + A/B/C пары логин/пароль");
    process.exit(0);
  }

  const tokenA = await loginOrThrow(base, "A", emailA, passwordA);
  const tokenB = await loginOrThrow(base, "B", emailB, passwordB);
  const tokenC = await loginOrThrow(base, "C", emailC, passwordC);

  const approverB = decodeJwtSubjectEmployeeId(tokenB);
  const approverC = decodeJwtSubjectEmployeeId(tokenC);
  assert.notEqual(approverB, approverC, "B и C должны быть разными сотрудниками");

  const unreadB0 = await unreadCount(base, tokenB);
  const unreadC0 = await unreadCount(base, tokenC);
  const unreadA0 = await unreadCount(base, tokenA);

  // create + submit
  const suffix = `${Date.now()}`;
  const createRes = await api(base, tokenA, "/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleDocumentPayload(suffix)),
    expect: 201
  });
  const created = (await json(createRes)) as { id?: string };
  assert.ok(created.id, "created document id");
  const docId = created.id!;

  await api(base, tokenA, `/documents/${docId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approverEmployeeIds: [approverB, approverC] })
  });

  // B gets document_submitted
  const submittedNotifB = await waitForNotification(base, tokenB, docId, "document_submitted");
  assert.equal(submittedNotifB.read, false, "Новая нотификация должна быть непрочитанной");
  const unreadB1 = await unreadCount(base, tokenB);
  assert.ok(unreadB1 >= unreadB0 + 1, `unread-count B должен вырасти, было=${unreadB0}, стало=${unreadB1}`);

  // mark read for B
  await api(base, tokenB, `/notifications/${submittedNotifB.id}/read`, {
    method: "POST",
    expect: 200
  });
  const unreadB2 = await unreadCount(base, tokenB);
  assert.equal(unreadB2, Math.max(0, unreadB1 - 1), `После mark read unread B должен уменьшиться на 1`);
  const bListAfterRead = await listNotifications(base, tokenB);
  const marked = bListAfterRead.find((n) => n.id === submittedNotifB.id);
  assert.equal(marked?.read, true, "Уведомление B должно стать прочитанным");

  // B approves step 1 -> C gets approval_step_assigned
  let taskB = await findTaskIdForDocument(base, tokenB, docId);
  if (!taskB) {
    await new Promise((r) => setTimeout(r, 400));
    taskB = await findTaskIdForDocument(base, tokenB, docId);
  }
  assert.ok(taskB, "У B должна быть задача по документу");
  await api(base, tokenB, `/approvals/${taskB}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });

  const stepAssignedC = await waitForNotification(base, tokenC, docId, "approval_step_assigned");
  assert.equal(stepAssignedC.read, false, "Уведомление C о шаге должно быть непрочитанным");
  const unreadC1 = await unreadCount(base, tokenC);
  assert.ok(unreadC1 >= unreadC0 + 1, `unread-count C должен вырасти, было=${unreadC0}, стало=${unreadC1}`);

  // C rejects -> A gets document_rejected
  let taskC = await findTaskIdForDocument(base, tokenC, docId);
  if (!taskC) {
    await new Promise((r) => setTimeout(r, 400));
    taskC = await findTaskIdForDocument(base, tokenC, docId);
  }
  assert.ok(taskC, "У C должна быть задача по документу");
  await api(base, tokenC, `/approvals/${taskC}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });

  const rejectedNotifA = await waitForNotification(base, tokenA, docId, "document_rejected");
  assert.equal(rejectedNotifA.read, false, "Уведомление A об отклонении должно быть непрочитанным");
  const unreadA1 = await unreadCount(base, tokenA);
  assert.ok(unreadA1 >= unreadA0 + 1, `unread-count A должен вырасти, было=${unreadA0}, стало=${unreadA1}`);

  // cleanup: rejected doc is deletable
  await api(base, tokenA, `/documents/${docId}`, {
    method: "DELETE",
    expect: 200
  });

  console.log("[notifications-e2e] OK: notifications API + domain inserts validated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

