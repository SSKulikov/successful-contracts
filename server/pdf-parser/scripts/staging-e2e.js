"use strict";
/**
 * Стендовый smoke / e2e по HTTP (без браузера).
 *
 * STAGING_API_URL — база API, например http://localhost:3003/api
 * STAGING_EMAIL, STAGING_PASSWORD — учётка с постоянным паролем (иначе 403 на POST/PATCH документов)
 * STAGING_EMAIL_B, STAGING_PASSWORD_B — второй сотрудник той же компании (опционально: PATCH чужого черновика → 403)
 * STAGING_REDIS_URL — опционально: PING Redis (тот же URL, что у API)
 *
 * npm run test:e2e
 * Без STAGING_API_URL — выход 0 (пропуск).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const ioredis_1 = __importDefault(require("ioredis"));
const json = (r) => r.json();
async function login(base, email, password) {
    const r = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    strict_1.default.equal(r.status, 200, `login ${email}: ${r.status} ${await r.text()}`);
    const data = (await json(r));
    strict_1.default.ok(data.token, "token in login response");
    return data.token;
}
async function api(base, token, path, init) {
    var _a, _b;
    const expectStatus = (_a = init === null || init === void 0 ? void 0 : init.expect) !== null && _a !== void 0 ? _a : 200;
    const { expect: _e, ...rest } = init !== null && init !== void 0 ? init : {};
    const r = await fetch(`${base}${path}`, {
        ...rest,
        headers: {
            ...rest.headers,
            Authorization: `Bearer ${token}`
        }
    });
    strict_1.default.equal(r.status, expectStatus, `${(_b = rest.method) !== null && _b !== void 0 ? _b : "GET"} ${path} expected ${expectStatus}, got ${r.status}: ${await r.clone().text()}`);
    return r;
}
function healthFromApiBase(apiBase) {
    const b = apiBase.replace(/\/+$/, "");
    if (b.endsWith("/api"))
        return `${b.slice(0, -4)}/health`;
    return `${b}/health`;
}
function sampleDocumentPayload(suffix) {
    return {
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
}
async function main() {
    var _a, _b, _c, _d, _f, _g, _h;
    const base = ((_b = (_a = process.env.STAGING_API_URL) !== null && _a !== void 0 ? _a : process.env.TEST_API_URL) !== null && _b !== void 0 ? _b : "").replace(/\/+$/, "");
    if (!base) {
        console.log("[staging-e2e] SKIP: задайте STAGING_API_URL (например http://localhost:3003/api)");
        process.exit(0);
    }
    const email = (_c = process.env.STAGING_EMAIL) !== null && _c !== void 0 ? _c : process.env.TEST_EMAIL;
    const password = (_d = process.env.STAGING_PASSWORD) !== null && _d !== void 0 ? _d : process.env.TEST_PASSWORD;
    if (!email || !password) {
        console.log("[staging-e2e] SKIP: задайте STAGING_EMAIL и STAGING_PASSWORD");
        process.exit(0);
    }
    const redisUrl = (_f = process.env.STAGING_REDIS_URL) === null || _f === void 0 ? void 0 : _f.trim();
    if (redisUrl) {
        const c = new ioredis_1.default(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
        try {
            await c.connect();
            strict_1.default.equal(await c.ping(), "PONG");
        }
        finally {
            c.disconnect();
        }
        console.log("[staging-e2e] Redis: PING OK");
    }
    else {
        console.log("[staging-e2e] Redis: пропуск (нет STAGING_REDIS_URL)");
    }
    const hr = await fetch(healthFromApiBase(base));
    strict_1.default.ok(hr.ok, `GET health ${hr.status}`);
    const tokenA = await login(base, email, password);
    const listRes = await api(base, tokenA, "/documents/my");
    const listPayload = (await json(listRes));
    strict_1.default.ok(Array.isArray(listPayload.items), "documents/my returns { items: [] }");
    const suffix = `${Date.now()}`;
    const createRes = await api(base, tokenA, "/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleDocumentPayload(suffix)),
        expect: 201
    });
    const created = (await json(createRes));
    strict_1.default.ok(created.id, "created document id");
    await api(base, tokenA, `/documents/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: `Обновлено e2e ${suffix}` })
    });
    const emailB = (_g = process.env.STAGING_EMAIL_B) === null || _g === void 0 ? void 0 : _g.trim();
    const passwordB = (_h = process.env.STAGING_PASSWORD_B) === null || _h === void 0 ? void 0 : _h.trim();
    if (emailB && passwordB && emailB.toLowerCase() !== email.toLowerCase()) {
        const tokenB = await login(base, emailB, passwordB);
        const forbidden = await fetch(`${base}/documents/${created.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenB}`
            },
            body: JSON.stringify({ subject: "hacked" })
        });
        strict_1.default.equal(forbidden.status, 403);
        console.log("[staging-e2e] Права: PATCH чужого черновика → 403 OK");
    }
    else {
        console.log("[staging-e2e] Права: пропуск (нет пары STAGING_EMAIL_B / STAGING_PASSWORD_B)");
    }
    const approvalsRes = await api(base, tokenA, `/approvals/my?page=1&page_size=5&q=${encodeURIComponent("e2e")}`);
    const approvals = (await json(approvalsRes));
    strict_1.default.ok(Array.isArray(approvals.items), "approvals/my items");
    console.log("[staging-e2e] OK: health, login, documents/my, POST+PATCH документа, approvals?q");
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
