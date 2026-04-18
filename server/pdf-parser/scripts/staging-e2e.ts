/**
 * Стендовый smoke / e2e по HTTP (без браузера).
 *
 * STAGING_API_URL — база API, например http://localhost:3003/api
 * STAGING_EMAIL, STAGING_PASSWORD — инициатор (постоянный пароль)
 * STAGING_EMAIL_B, STAGING_PASSWORD_B — второй сотрудник той же компании (согласующий + PATCH 403)
 * STAGING_APPROVER_EMPLOYEE_ID — опционально: numeric id сотрудника B (если не задан — первый из GET /company/employees, отличный от инициатора)
 * STAGING_REDIS_URL — опционально: PING Redis
 *
 * Полный цикл (если задана пара B): create → PATCH (A) → PATCH 403 (B) → submit → revise (B) → resubmit (A) → approve (B) → карточка «Согласован».
 *
 * npm run test:e2e
 * Без STAGING_API_URL — выход 0 (пропуск).
 */

import assert from "node:assert/strict";
import Redis from "ioredis";

const json = (r: Response) => r.json() as Promise<unknown>;

/** Читает `sub` из JWT без проверки подписи (только для smoke на своём стенде). */
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
  assert.equal(r.status, 200, `login ${email}: ${r.status} ${await r.text()}`);
  const data = (await json(r)) as { token?: string };
  assert.ok(data.token, "token in login response");
  return data.token!;
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

function healthFromApiBase(apiBase: string): string {
  const b = apiBase.replace(/\/+$/, "");
  if (b.endsWith("/api")) return `${b.slice(0, -4)}/health`;
  return `${b}/health`;
}

function sampleDocumentPayload(suffix: string) {
  const row: Record<string, unknown> = {
    type: "Договор",
    number: `E2E-${suffix}`,
    date: "2026-04-18",
    customerName: "ООО Заказчик",
    customerInn: "7700000000",
    executorName: "ООО Исполнитель",
    executorInn: "7800000000",
    amount: 1000,
    subject: "Предмет e2e",
    note: ""
  };
  const cidRaw = process.env.STAGING_COMPANY_ID?.trim();
  if (cidRaw) {
    const cid = Number(cidRaw);
    if (Number.isInteger(cid) && cid > 0) row.companyId = cid;
  }
  return row;
}

async function pickApproverEmployeeId(
  base: string,
  tokenA: string,
  initiatorEmployeeId: number,
  explicit: string | undefined,
  documentId: string
): Promise<number | null> {
  if (explicit) {
    const n = Number(explicit);
    return Number.isInteger(n) && n > 0 && n !== initiatorEmployeeId ? n : null;
  }
  const docRes = await api(base, tokenA, `/documents/${documentId}`);
  const doc = (await json(docRes)) as { companyId?: number | null };
  const cid = doc.companyId;
  const empPath =
    cid != null ? `/company/employees?companyId=${encodeURIComponent(String(cid))}` : "/company/employees";
  const r = await api(base, tokenA, empPath);
  const data = (await json(r)) as { items?: Array<{ id: number }> };
  const items = data.items ?? [];
  const other = items.find((x) => x.id !== initiatorEmployeeId);
  return other?.id ?? null;
}

async function findTaskIdForDocument(base: string, token: string, documentId: string): Promise<string | null> {
  const r = await api(base, token, `/approvals/my?page=1&page_size=50`);
  const data = (await json(r)) as { items?: Array<{ id: string; documentId?: string }> };
  const hit = (data.items ?? []).find((x) => String(x.documentId ?? "") === String(documentId));
  return hit?.id ?? null;
}

async function main() {
  const base = (process.env.STAGING_API_URL ?? process.env.TEST_API_URL ?? "").replace(/\/+$/, "");
  if (!base) {
    console.log("[staging-e2e] SKIP: задайте STAGING_API_URL (например http://localhost:3003/api)");
    process.exit(0);
  }

  const email = process.env.STAGING_EMAIL ?? process.env.TEST_EMAIL;
  const password = process.env.STAGING_PASSWORD ?? process.env.TEST_PASSWORD;
  if (!email || !password) {
    console.log("[staging-e2e] SKIP: задайте STAGING_EMAIL и STAGING_PASSWORD");
    process.exit(0);
  }

  const redisUrl = process.env.STAGING_REDIS_URL?.trim();
  if (redisUrl) {
    const c = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    try {
      await c.connect();
      assert.equal(await c.ping(), "PONG");
    } finally {
      c.disconnect();
    }
    console.log("[staging-e2e] Redis: PING OK");
  } else {
    console.log("[staging-e2e] Redis: пропуск (нет STAGING_REDIS_URL)");
  }

  const hr = await fetch(healthFromApiBase(base));
  assert.ok(hr.ok, `GET health ${hr.status}`);

  const tokenA = await login(base, email, password);
  const initiatorId = decodeJwtSubjectEmployeeId(tokenA);

  const listRes = await api(base, tokenA, "/documents/my");
  const listPayload = (await json(listRes)) as { items?: unknown[] };
  assert.ok(Array.isArray(listPayload.items), "documents/my returns { items: [] }");

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

  await api(base, tokenA, `/documents/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: `Обновлено e2e ${suffix}` })
  });

  const emailB = process.env.STAGING_EMAIL_B?.trim();
  const passwordB = process.env.STAGING_PASSWORD_B?.trim();
  if (emailB && passwordB && emailB.toLowerCase() !== email.toLowerCase()) {
    const tokenB = await login(base, emailB, passwordB);
    const forbidden = await fetch(`${base}/documents/${docId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ subject: "hacked" })
    });
    assert.equal(forbidden.status, 403);
    console.log("[staging-e2e] Права: PATCH чужого черновика → 403 OK");

    const approverRaw = process.env.STAGING_APPROVER_EMPLOYEE_ID?.trim();
    const approverId = await pickApproverEmployeeId(base, tokenA, initiatorId, approverRaw, docId);
    if (approverId == null) {
      console.log(
        "[staging-e2e] Цикл согласования: пропуск — не найден другой сотрудник (STAGING_APPROVER_EMPLOYEE_ID или второй сотрудник в GET /company/employees?companyId=… для платформенного админа)"
      );
    } else {
      await api(base, tokenA, `/documents/${docId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approverEmployeeIds: [approverId] })
      });
      console.log("[staging-e2e] Submit: документ отправлен на согласование");

      let taskId = await findTaskIdForDocument(base, tokenB, docId);
      if (!taskId) {
        await new Promise((r) => setTimeout(r, 400));
        taskId = await findTaskIdForDocument(base, tokenB, docId);
      }
      assert.ok(taskId, "У согласующего должна появиться задача в /approvals/my");

      await api(base, tokenB, `/approvals/${taskId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "e2e staging: на доработку" })
      });
      console.log("[staging-e2e] Revise: документ на доработке");

      await api(base, tokenA, `/documents/${docId}/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      console.log("[staging-e2e] Resubmit: снова на согласовании");

      let task2 = await findTaskIdForDocument(base, tokenB, docId);
      if (!task2) {
        await new Promise((r) => setTimeout(r, 400));
        task2 = await findTaskIdForDocument(base, tokenB, docId);
      }
      assert.ok(task2, "После resubmit снова должна быть задача у согласующего");

      await api(base, tokenB, `/approvals/${task2}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      console.log("[staging-e2e] Approve: шаг согласован");

      const cardRes = await api(base, tokenA, `/documents/${docId}`);
      const card = (await json(cardRes)) as { status?: string };
      assert.equal(card.status, "Согласован", `ожидался финальный статус, получено: ${card.status}`);
      console.log("[staging-e2e] Карточка: статус «Согласован» OK");
    }
  } else {
    console.log("[staging-e2e] Права и цикл согласования: пропуск (нет STAGING_EMAIL_B / STAGING_PASSWORD_B)");
  }

  const approvalsRes = await api(
    base,
    tokenA,
    `/approvals/my?page=1&page_size=5&q=${encodeURIComponent("e2e")}`
  );
  const approvals = (await json(approvalsRes)) as { items?: unknown[] };
  assert.ok(Array.isArray(approvals.items), "approvals/my items");

  console.log("[staging-e2e] OK: базовые проверки + при наличии B — полный цикл согласования");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
