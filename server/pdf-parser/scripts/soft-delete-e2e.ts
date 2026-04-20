/**
 * E2E: soft delete сотрудников
 *
 * Проверяет:
 * 1) удалённый сотрудник не может залогиниться;
 * 2) удалённого сотрудника нельзя назначить в шаг маршрута;
 * 3) в истории документа автор удалённого сотрудника отображается как "Удаленный пользователь".
 *
 * Переменные окружения:
 * - STAGING_API_URL
 * - STAGING_PLATFORM_ADMIN_EMAIL
 * - STAGING_PLATFORM_ADMIN_PASSWORD
 * - STAGING_SOFT_DELETE_COMPANY_ID (опционально; если не задан — берётся первая компания из /admin/companies)
 */

import assert from "node:assert/strict";

type LoginResponse = { token: string };

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

function sampleDocumentPayload(suffix: string) {
  return {
    type: "Договор",
    number: `E2E-SD-${suffix}`,
    date: "2026-04-20",
    customerName: "ООО Заказчик",
    customerInn: "7700000000",
    executorName: "ООО Исполнитель",
    executorInn: "7800000000",
    amount: 1700,
    subject: "Проверка soft delete",
    note: ""
  };
}

async function main() {
  const base = (process.env.STAGING_API_URL ?? "").replace(/\/+$/, "");
  const adminEmail = process.env.STAGING_PLATFORM_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.STAGING_PLATFORM_ADMIN_PASSWORD?.trim();
  const explicitCompanyId = Number(process.env.STAGING_SOFT_DELETE_COMPANY_ID ?? "");

  if (!base || !adminEmail || !adminPassword) {
    console.log("[soft-delete-e2e] SKIP: задайте STAGING_API_URL, STAGING_PLATFORM_ADMIN_EMAIL, STAGING_PLATFORM_ADMIN_PASSWORD");
    process.exit(0);
  }

  const adminLogin = await login(base, adminEmail, adminPassword);
  const adminToken = adminLogin.token;
  console.log(`[soft-delete-e2e] Login admin OK (${adminEmail})`);

  // 1) Выбираем компанию
  let companyId = Number.isInteger(explicitCompanyId) && explicitCompanyId > 0 ? explicitCompanyId : 0;
  if (!companyId) {
    const companiesRes = await api(base, adminToken, "/admin/companies");
    const companies = (await json(companiesRes)) as { items?: Array<{ key: string }> };
    const first = (companies.items ?? [])[0];
    assert.ok(first, "Не найдено компаний для теста soft-delete");
    companyId = Number(first.key);
  }
  assert.ok(Number.isInteger(companyId) && companyId > 0, "Некорректный companyId для soft-delete теста");

  // 2) Создаём временного сотрудника
  const suffix = `${Date.now()}`;
  const employeeEmail = `e2e-soft-delete-${suffix}@example.test`;
  const employeeFullName = `E2E Soft Delete ${suffix}`;
  const oneTimePassword = `Otp-${suffix}-Aa!`;

  const createEmployeeRes = await api(base, adminToken, "/admin/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: employeeFullName,
      email: employeeEmail,
      position: "Финансист",
      roles: ["financier"],
      companyId,
      oneTimePassword
    }),
    expect: 201
  });
  const createEmployeeData = (await json(createEmployeeRes)) as { oneTimePassword?: string };
  const otp = String(createEmployeeData.oneTimePassword ?? oneTimePassword);
  console.log(`[soft-delete-e2e] Created employee ${employeeEmail}`);

  // 3) Находим id созданного сотрудника
  const employeesRes = await api(base, adminToken, "/admin/employees");
  const employees = (await json(employeesRes)) as {
    items?: Array<{ key: string; email: string }>;
  };
  const createdEmployee = (employees.items ?? []).find((e) => e.email.trim().toLowerCase() === employeeEmail);
  assert.ok(createdEmployee, `Не найден созданный сотрудник ${employeeEmail}`);
  const employeeId = createdEmployee!.key;

  // 4) Сотрудник меняет временный пароль и создаёт документ
  const employeeLoginTemp = await login(base, employeeEmail, otp);
  const employeeTempToken = employeeLoginTemp.token;
  const permanentPassword = `Perm-${suffix}-Aa!`;
  await api(base, employeeTempToken, "/users/me/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: otp, newPassword: permanentPassword })
  });

  const employeeLoginPerm = await login(base, employeeEmail, permanentPassword);
  const employeeToken = employeeLoginPerm.token;
  const createDocRes = await api(base, employeeToken, "/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleDocumentPayload(suffix)),
    expect: 201
  });
  const createDocData = (await json(createDocRes)) as { id?: string };
  assert.ok(createDocData.id, "Не получен id созданного документа");
  const documentId = createDocData.id!;
  console.log(`[soft-delete-e2e] Employee created document ${documentId}`);

  // 5) Удаляем сотрудника (soft delete)
  await api(base, adminToken, `/admin/employees/${employeeId}`, {
    method: "DELETE",
    expect: 200
  });
  console.log(`[soft-delete-e2e] Employee soft-deleted (id=${employeeId})`);

  // 6) Проверяем запрет логина удалённого сотрудника
  const relogin = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: employeeEmail, password: permanentPassword })
  });
  assert.equal(relogin.status, 401, `Удалённый сотрудник не должен логиниться, получили ${relogin.status}`);

  // 7) Проверяем, что удалённого сотрудника нельзя назначить в маршрут
  const routeRes = await fetch(`${base}/admin/routes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      companyId,
      name: `E2E route with deleted user ${suffix}`,
      isDefault: false,
      steps: [
        {
          stepOrder: 1,
          assigneeKind: "employee",
          assigneeEmployeeId: Number(employeeId)
        }
      ]
    })
  });
  const routeRaw = await routeRes.text();
  assert.equal(routeRes.status, 400, `Ожидался 400 при назначении удалённого в маршрут, получили ${routeRes.status}: ${routeRaw}`);

  // 8) Проверяем историю документа: автор удалённого сотрудника отображается как "Удаленный пользователь"
  const cardRes = await api(base, adminToken, `/documents/${documentId}`);
  const card = (await json(cardRes)) as { history?: Array<{ author?: string; action?: string }> };
  const hasDeletedAuthor = (card.history ?? []).some((h) => h.author === "Удаленный пользователь");
  assert.equal(
    hasDeletedAuthor,
    true,
    `В истории документа должен быть автор "Удаленный пользователь" после soft delete; history=${JSON.stringify(card.history ?? [])}`
  );

  // 9) Cleanup документа
  await api(base, adminToken, `/documents/${documentId}`, {
    method: "DELETE",
    expect: 200
  });

  console.log("[soft-delete-e2e] OK: login denied, routes reject deleted assignee, history marks deleted user");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

