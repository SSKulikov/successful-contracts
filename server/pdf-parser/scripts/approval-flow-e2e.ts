/**
 * Интеграционный e2e-сценарий критичного approval-flow:
 * submit -> approve (много шагов) -> финальный статус "Согласован".
 *
 * Переменные окружения:
 * - STAGING_API_URL (например http://localhost:3003/api)
 * - STAGING_EMAIL / STAGING_PASSWORD       (инициатор)
 * - STAGING_EMAIL_B / STAGING_PASSWORD_B   (1-й согласующий)
 * - STAGING_EMAIL_C / STAGING_PASSWORD_C   (2-й согласующий)
 * - STAGING_COMPANY_ID                     (опционально, если инициатор — платформенный админ)
 *
 * Запуск:
 * npm run test:e2e:approval-flow
 */

import assert from "node:assert/strict";

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
  let data: { token?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as { token?: string }) : {};
  } catch {
    throw new Error(`login ${email}: ответ не JSON: ${raw}`);
  }
  assert.ok(data.token, "token in login response");
  return data.token!;
}

async function loginOrThrow(base: string, label: "A" | "B" | "C", email: string, password: string): Promise<string> {
  try {
    const token = await login(base, email, password);
    console.log(`[approval-flow-e2e] Login ${label} OK (${email})`);
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[approval-flow-e2e] Login ${label} failed (${email}): ${message}`);
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
    number: `E2E-FLOW-${suffix}`,
    date: "2026-04-20",
    customerName: "ООО Заказчик",
    customerInn: "7700000000",
    executorName: "ООО Исполнитель",
    executorInn: "7800000000",
    amount: 2500,
    subject: "Критичный approval-flow e2e",
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

async function assertNoTaskForDocument(base: string, token: string, documentId: string): Promise<void> {
  const taskId = await findTaskIdForDocument(base, token, documentId);
  assert.equal(taskId, null, `Не ожидалась активная задача по документу ${documentId}`);
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
    console.log("[approval-flow-e2e] SKIP: задайте STAGING_API_URL + A/B/C пары логин/пароль");
    process.exit(0);
  }

  const tokenA = await loginOrThrow(base, "A", emailA, passwordA);
  const tokenB = await loginOrThrow(base, "B", emailB, passwordB);
  const tokenC = await loginOrThrow(base, "C", emailC, passwordC);

  const approverB = decodeJwtSubjectEmployeeId(tokenB);
  const approverC = decodeJwtSubjectEmployeeId(tokenC);
  assert.notEqual(approverB, approverC, "B и C должны быть разными сотрудниками");

  const suffix = `${Date.now()}`;
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
  console.log("[approval-flow-e2e] Submit: документ отправлен на 2 шага");

  let taskB = await findTaskIdForDocument(base, tokenB, docId);
  if (!taskB) {
    await new Promise((r) => setTimeout(r, 500));
    taskB = await findTaskIdForDocument(base, tokenB, docId);
  }
  assert.ok(taskB, "У первого согласующего должна быть активная задача");
  await assertNoTaskForDocument(base, tokenC, docId);
  console.log("[approval-flow-e2e] Шаг 1 активен у B, у C задачи нет");

  await api(base, tokenB, `/approvals/${taskB}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  console.log("[approval-flow-e2e] Шаг 1 согласован");

  let taskC = await findTaskIdForDocument(base, tokenC, docId);
  if (!taskC) {
    await new Promise((r) => setTimeout(r, 500));
    taskC = await findTaskIdForDocument(base, tokenC, docId);
  }
  assert.ok(taskC, "После approve шага 1 задача должна перейти к C");
  await assertNoTaskForDocument(base, tokenB, docId);
  console.log("[approval-flow-e2e] Шаг 2 активирован у C");

  await api(base, tokenC, `/approvals/${taskC}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  console.log("[approval-flow-e2e] Шаг 2 согласован");

  const cardRes = await api(base, tokenA, `/documents/${docId}`);
  const card = (await json(cardRes)) as { status?: string };
  assert.equal(card.status, "Согласован", `Ожидался финальный статус "Согласован", получено: ${card.status}`);

  await assertNoTaskForDocument(base, tokenB, docId);
  await assertNoTaskForDocument(base, tokenC, docId);

  console.log("[approval-flow-e2e] OK: submit -> approve (много шагов) -> Согласован");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

