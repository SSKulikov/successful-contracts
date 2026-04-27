import { expect, test } from "@playwright/test";

test("zero to approved critical path", async ({ page }) => {
  let documentStatus: "uploaded" | "in_approval" | "approved" = "uploaded";
  let approvalOpen = false;
  let documentExists = false;
  let documentsListReads = 0;
  const documentId = "DOC-501";
  const approvalId = "APR-501";

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (!path.startsWith("/api/")) {
      await route.continue();
      return;
    }

    if (path.endsWith("/auth/login") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "test-token",
          isTemporaryPassword: false,
          user: {
            id: 101,
            fullName: "Тестовый Сотрудник",
            email: "employee@test.local",
            role: "employee",
            companyId: 1,
            mustChangePassword: false
          }
        })
      });
      return;
    }

    if (path.endsWith("/notifications/unread-count") && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) });
      return;
    }

    if (path.endsWith("/documents/my/stats") && method === "GET") {
      const byStatus = { uploaded: 0, in_approval: 0, revision: 0, rejected: 0, approved: 0 };
      if (documentExists) byStatus[documentStatus] = 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ byStatus }) });
      return;
    }

    if (path.endsWith("/documents/my") && method === "GET") {
      documentsListReads += 1;
      if (documentExists && documentsListReads >= 2) {
        documentStatus = "approved";
      }
      const items = documentExists
        ? [
            {
              id: documentId,
              type: "Договор",
              title: "Договор поставки №501",
              status: documentStatus,
              initiator: "Тестовый Сотрудник",
              amount: "100000",
              createdAt: "2026-04-21T10:00:00.000Z"
            }
          ]
        : [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items }) });
      return;
    }

    if (path.endsWith("/documents") && method === "POST") {
      documentExists = true;
      documentStatus = "uploaded";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: documentId, status: "uploaded" })
      });
      return;
    }

    if (path.endsWith("/company/approval-routes") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
      return;
    }

    if (path.endsWith("/company/employees") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: 201, fullName: "Тестовый Руководитель", position: "Руководитель отдела" }])
      });
      return;
    }

    if (path.endsWith(`/documents/${documentId}/submit`) && method === "POST") {
      documentStatus = "in_approval";
      approvalOpen = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (path.endsWith("/approvals/my") && method === "GET") {
      const items = approvalOpen
        ? [
            {
              id: approvalId,
              key: approvalId,
              documentId,
              type: "Договор",
              title: "Договор поставки №501",
              initiator: "Тестовый Сотрудник",
              amount: "100000",
              waitingDays: 1,
              currentStep: "Руководитель отдела",
              receivedAt: "2026-04-21T10:20:00.000Z",
              priority: "Обычный",
              canTakeDecision: true
            }
          ]
        : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items, meta: { page: 1, pageSize: 8, total: items.length } })
      });
      return;
    }

    if (path.endsWith(`/approvals/${approvalId}/approve`) && method === "POST") {
      approvalOpen = false;
      documentStatus = "approved";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Not mocked" }) });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto("/auth");
  await expect(page.getByText("Доступ в систему").first()).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Email или логин").fill("employee@test.local");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/my-documents/);

  await page.getByRole("button", { name: "Создать документ" }).click();
  await page.getByLabel("Тип документа").click();
  await page.getByTitle("Договор").click();
  await page.getByLabel("Номер").fill("501");
  await page.getByLabel("Дата").fill("2026-04-21");
  await page.getByLabel("Заказчик/Плательщик").fill("ООО Заказчик");
  await page.getByLabel("ИНН заказчика").fill("7701234567");
  await page.getByLabel("Наименование исполнителя").fill("ООО Исполнитель");
  await page.getByLabel("ИНН исполнителя").fill("7707654321");
  await page.getByRole("spinbutton", { name: "* Сумма" }).fill("100000");
  await page.getByLabel("Основание / предмет").fill("Поставка оборудования");
  await page.getByRole("button", { name: "OK" }).click();

  await expect(page.getByText(documentId)).toBeVisible();
  await page.reload();

  await page.getByRole("menuitem", { name: "Мои документы" }).click();
  await expect(page).toHaveURL(/my-documents/);
  const documentRow = page.locator(".ant-table-tbody tr", { hasText: documentId });
  await expect(documentRow).toContainText("Согласован");
});
