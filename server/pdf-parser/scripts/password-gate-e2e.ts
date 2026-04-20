/**
 * E2E: password-gate (`requirePasswordNotTemporary`)
 *
 * Проверяет:
 * 1) после reset пароля сотруднику (one-time) ключевые мутации блокируются 403 + code=PASSWORD_CHANGE_REQUIRED
 * 2) после POST /users/me/change-password блокировка снимается и мутации доходят до контроллеров
 *
 * Переменные окружения:
 * - STAGING_API_URL                 (например http://localhost:3003/api)
 * - STAGING_PLATFORM_ADMIN_EMAIL    (платформенный админ)
 * - STAGING_PLATFORM_ADMIN_PASSWORD
 * - STAGING_GATE_EMAIL              (сотрудник, над которым проверяем gate)
 */

import assert from "node:assert/strict";

type LoginResponse = {
  token: string;
  user: {
    fullName: string;
    email: string;
  };
};

const json = (r: Response) => r.json() as Promise<unknown>;

async function login(base: string, email: string, password: string): Promise<LoginResponse> {
  const r = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const raw = await r.text();
  assert.equal(r.status, 200, `login ${email}: ${r.status} ${raw}`);
  const data = raw ? (JSON.parse(raw) as LoginResponse) : ({} as LoginResponse);
  assert.ok(data.token, `token отсутствует для ${email}`);
  return data;
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

async function expectPasswordGate(
  base: string,
  token: string,
  path: string,
  init?: RequestInit
): Promise<void> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`
    }
  });
  const body = (await json(r)) as { code?: string; message?: string };
  assert.equal(r.status, 403, `Ожидался 403 PASSWORD gate на ${path}, получили ${r.status}`);
  assert.equal(body.code, "PASSWORD_CHANGE_REQUIRED", `Ожидался code=PASSWORD_CHANGE_REQUIRED на ${path}`);
}

function sampleDocumentPayload(suffix: string) {
  return {
    type: "Договор",
    number: `E2E-GATE-${suffix}`,
    date: "2026-04-20",
    customerName: "ООО Заказчик",
    customerInn: "7700000000",
    executorName: "ООО Исполнитель",
    executorInn: "7800000000",
    amount: 1200,
    subject: "Проверка password gate",
    note: ""
  };
}

async function main() {
  const base = (process.env.STAGING_API_URL ?? "").replace(/\/+$/, "");
  const adminEmail = process.env.STAGING_PLATFORM_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.STAGING_PLATFORM_ADMIN_PASSWORD?.trim();
  const gateEmail = process.env.STAGING_GATE_EMAIL?.trim().toLowerCase();

  if (!base || !adminEmail || !adminPassword || !gateEmail) {
    console.log(
      "[password-gate-e2e] SKIP: задайте STAGING_API_URL, STAGING_PLATFORM_ADMIN_EMAIL, STAGING_PLATFORM_ADMIN_PASSWORD, STAGING_GATE_EMAIL"
    );
    process.exit(0);
  }

  // 1) Логин платформенного админа
  const adminLogin = await login(base, adminEmail, adminPassword);
  const adminToken = adminLogin.token;
  console.log(`[password-gate-e2e] Login admin OK (${adminEmail})`);

  // 2) Находим сотрудника для проверки gate
  const employeesRes = await api(base, adminToken, "/admin/employees");
  const employees = (await json(employeesRes)) as {
    items?: Array<{ key: string; email: string; deletedAt?: string | null }>;
  };
  const employee = (employees.items ?? []).find((e) => e.email.trim().toLowerCase() === gateEmail);
  assert.ok(employee, `Сотрудник ${gateEmail} не найден в /admin/employees`);
  assert.ok(!employee!.deletedAt, `Сотрудник ${gateEmail} удалён, выберите активного`);

  // 3) Сбрасываем пароль сотруднику -> one-time пароль
  const resetRes = await api(base, adminToken, `/admin/employees/${employee!.key}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const resetData = (await json(resetRes)) as { oneTimePassword?: string };
  const oneTimePassword = String(resetData.oneTimePassword ?? "");
  assert.ok(oneTimePassword, "Не получен oneTimePassword после reset");
  console.log(`[password-gate-e2e] Reset password OK for ${gateEmail}`);

  // 4) Логин сотрудника с одноразовым паролем
  const gateLogin = await login(base, gateEmail, oneTimePassword);
  const gateToken = gateLogin.token;
  console.log(`[password-gate-e2e] Login gate-user with temp password OK (${gateEmail})`);

  // 5) Проверяем блокировку ключевых мутаций
  await expectPasswordGate(base, gateToken, "/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleDocumentPayload(`${Date.now()}-blocked`))
  });
  await expectPasswordGate(base, gateToken, "/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: gateLogin.user.fullName, email: gateLogin.user.email })
  });
  await expectPasswordGate(base, gateToken, "/users/me/avatar", {
    method: "POST"
  });
  await expectPasswordGate(base, gateToken, "/notifications/999999/read", {
    method: "POST"
  });
  console.log("[password-gate-e2e] Gate блокирует ключевые мутации (403 + PASSWORD_CHANGE_REQUIRED)");

  // 6) Меняем пароль -> gate должен сняться
  const newPassword = `NewPass-${Date.now()}-!A`;
  await api(base, gateToken, "/users/me/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: oneTimePassword, newPassword })
  });
  console.log("[password-gate-e2e] change-password OK");

  // 7) Логин с новым паролем и проверка разблокировки
  const unlockedLogin = await login(base, gateEmail, newPassword);
  const unlockedToken = unlockedLogin.token;
  console.log(`[password-gate-e2e] Login with new password OK (${gateEmail})`);

  // /users/me PATCH теперь проходит middleware (ожидаем 200)
  await api(base, unlockedToken, "/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: unlockedLogin.user.fullName, email: unlockedLogin.user.email }),
    expect: 200
  });

  // /users/me/avatar теперь доходит до контроллера (ожидаем 400 "Добавьте файл...")
  await api(base, unlockedToken, "/users/me/avatar", {
    method: "POST",
    expect: 400
  });

  // /notifications/:id/read теперь доходит до контроллера (ожидаем 404 не найдено)
  await api(base, unlockedToken, "/notifications/999999/read", {
    method: "POST",
    expect: 404
  });

  // /documents POST теперь доходит до контроллера и создаёт документ
  const createdDocRes = await api(base, unlockedToken, "/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleDocumentPayload(`${Date.now()}-unlocked`)),
    expect: 201
  });
  const createdDoc = (await json(createdDocRes)) as { id?: string };
  assert.ok(createdDoc.id, "Не получили id созданного документа после снятия gate");
  await api(base, unlockedToken, `/documents/${createdDoc.id}`, {
    method: "DELETE",
    expect: 200
  });

  console.log("[password-gate-e2e] OK: после change-password мутации разблокированы");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

