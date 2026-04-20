/**
 * Интеграционный e2e-сценарий веток решений:
 * - submit -> revise (шаг 1)  => статус документа "На доработке", оставшиеся задачи отменены
 * - submit -> reject (шаг 1)  => статус документа "Отклонен", оставшиеся задачи отменены
 *
 * Переменные окружения:
 * - STAGING_API_URL (например http://localhost:3003/api)
 * - STAGING_EMAIL / STAGING_PASSWORD       (инициатор)
 * - STAGING_EMAIL_B / STAGING_PASSWORD_B   (1-й согласующий)
 * - STAGING_EMAIL_C / STAGING_PASSWORD_C   (2-й согласующий)
 * - STAGING_COMPANY_ID                     (опционально, если инициатор — платформенный админ)
 *
 * Запуск:
 * npm run test:e2e:approval-branches
 */

import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const json = (r: Response) => r.json() as Promise<unknown>;
const prisma = new PrismaClient();

type TaskRow = {
  step_order: number;
  assignee_user_id: number;
  status: string;
};

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
    console.log(`[approval-branches-e2e] Login ${label} OK (${email})`);
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[approval-branches-e2e] Login ${label} failed (${email}): ${message}`);
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
    `${rest.method ?? "GET"} ${path} expected ${expectStatus}, got ${r.status}: ${await r.clone().text()}`
  );
  return r;
}

function sampleDocumentPayload(suffix: string) {
  const row: Record<string, unknown> = {
    type: "Договор",
    number: `E2E-BR-${suffix}`,
    date: "2026-04-20",
    customerName: "ООО Заказчик",
    customerInn: "7700000000",
    executorName: "ООО Исполнитель",
    executorInn: "7800000000",
    amount: 3200,
    subject: "Проверка reject/revise",
    note: ""
  };
  const cidRaw = process.env.STAGING_COMPANY_ID?.trim();
  if (cidRaw) {
    const cid = Number(cidRaw);
    if (Number.isInteger(cid) && cid > 0) row.companyId = cid;
  }
  return row;
}

async function findTaskIdForDocument(base: string, token: string, documentId: string): Promise<string | null> {
  const r = await api(base, token, `/approvals/my?page=1&page_size=50`);
  const data = (await json(r)) as { items?: Array<{ id: string; documentId?: string }> };
  const hit = (data.items ?? []).find((x) => String(x.documentId ?? "") === String(documentId));
  return hit?.id ?? null;
}

async function createAndSubmitTwoStepDoc(
  base: string,
  tokenA: string,
  approverB: number,
  approverC: number,
  suffix: string
): Promise<string> {
  const createRes = await api(base, tokenA, "/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleDocumentPayload(suffix)),
    expect: 201
  });
  const created = (await json(createRes)) as { id: string };
  assert.ok(created.id, "created document id");
  const docId = created.id;

  await api(base, tokenA, `/documents/${docId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approverEmployeeIds: [approverB, approverC] })
  });
  return docId;
}

async function fetchTaskRows(documentId: string): Promise<TaskRow[]> {
  const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
    `SELECT step_order, assignee_user_id, status FROM approval_tasks WHERE document_id = ? ORDER BY step_order ASC`,
    Number(documentId)
  );
  return rows;
}

async function assertCardStatus(base: string, tokenA: string, documentId: string, expectedRuStatus: string): Promise<void> {
  const cardRes = await api(base, tokenA, `/documents/${documentId}`);
  const card = (await json(cardRes)) as { status?: string };
  assert.equal(card.status, expectedRuStatus, `Ожидался статус "${expectedRuStatus}", получено: ${card.status}`);
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
    console.log("[approval-branches-e2e] SKIP: задайте STAGING_API_URL + A/B/C пары логин/пароль");
    process.exit(0);
  }

  const tokenA = await loginOrThrow(base, "A", emailA, passwordA);
  const tokenB = await loginOrThrow(base, "B", emailB, passwordB);
  const tokenC = await loginOrThrow(base, "C", emailC, passwordC);

  const approverB = decodeJwtSubjectEmployeeId(tokenB);
  const approverC = decodeJwtSubjectEmployeeId(tokenC);
  assert.notEqual(approverB, approverC, "B и C должны быть разными сотрудниками");

  // Ветка revise
  const reviseDocId = await createAndSubmitTwoStepDoc(base, tokenA, approverB, approverC, `${Date.now()}-revise`);
  let reviseTaskB = await findTaskIdForDocument(base, tokenB, reviseDocId);
  if (!reviseTaskB) {
    await new Promise((r) => setTimeout(r, 500));
    reviseTaskB = await findTaskIdForDocument(base, tokenB, reviseDocId);
  }
  assert.ok(reviseTaskB, "Для revise-ветки у B должна быть активная задача");

  await api(base, tokenB, `/approvals/${reviseTaskB}/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "e2e: вернуть на доработку" })
  });

  await assertCardStatus(base, tokenA, reviseDocId, "На доработке");
  const reviseTasks = await fetchTaskRows(reviseDocId);
  assert.equal(reviseTasks.length, 2, "Ожидались 2 задачи в revise-ветке");
  assert.equal(reviseTasks[0]?.status, "revision_requested", "Шаг 1 должен стать revision_requested");
  assert.equal(reviseTasks[1]?.status, "cancelled", "Шаг 2 должен быть отменён");
  console.log("[approval-branches-e2e] Revise ветка OK: remaining tasks cancelled");

  // Ветка reject
  const rejectDocId = await createAndSubmitTwoStepDoc(base, tokenA, approverB, approverC, `${Date.now()}-reject`);
  let rejectTaskB = await findTaskIdForDocument(base, tokenB, rejectDocId);
  if (!rejectTaskB) {
    await new Promise((r) => setTimeout(r, 500));
    rejectTaskB = await findTaskIdForDocument(base, tokenB, rejectDocId);
  }
  assert.ok(rejectTaskB, "Для reject-ветки у B должна быть активная задача");

  await api(base, tokenB, `/approvals/${rejectTaskB}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });

  await assertCardStatus(base, tokenA, rejectDocId, "Отклонен");
  const rejectTasks = await fetchTaskRows(rejectDocId);
  assert.equal(rejectTasks.length, 2, "Ожидались 2 задачи в reject-ветке");
  assert.equal(rejectTasks[0]?.status, "rejected", "Шаг 1 должен стать rejected");
  assert.equal(rejectTasks[1]?.status, "cancelled", "Шаг 2 должен быть отменён");
  console.log("[approval-branches-e2e] Reject ветка OK: remaining tasks cancelled");

  await prisma.$disconnect();
  console.log("[approval-branches-e2e] OK: reject/revise ветки валидны");
}

main().catch(async (e) => {
  await prisma.$disconnect();
  console.error(e);
  process.exit(1);
});

