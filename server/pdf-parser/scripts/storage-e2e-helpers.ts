import assert from "node:assert/strict";
import dotenv from "dotenv";

dotenv.config();

export type LoginResult = {
  token: string;
  employeeId: number;
};

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getApiBase(): string | null {
  const base = (process.env.STAGING_API_URL ?? process.env.TEST_API_URL ?? "").trim().replace(/\/+$/, "");
  return base || null;
}

export function decodeJwtSubjectEmployeeId(token: string): number {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Некорректный JWT");
  const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { sub?: string };
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) throw new Error("JWT sub (employee id) отсутствует или неверный");
  return id;
}

export async function login(base: string): Promise<LoginResult> {
  const email = process.env.STAGING_EMAIL ?? process.env.TEST_EMAIL;
  const password = process.env.STAGING_PASSWORD ?? process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error("Missing STAGING_EMAIL/STAGING_PASSWORD for storage e2e");
  }

  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const raw = await response.text();
  assert.equal(response.status, 200, `login failed: ${response.status} ${raw}`);

  const data = JSON.parse(raw) as { token?: string };
  assert.ok(data.token, "token in login response");
  return {
    token: data.token,
    employeeId: decodeJwtSubjectEmployeeId(data.token)
  };
}

export async function api(
  base: string,
  token: string,
  path: string,
  init?: RequestInit & { expect?: number }
): Promise<Response> {
  const expected = init?.expect ?? 200;
  const { expect: _expect, ...rest } = init ?? {};
  const response = await fetch(`${base}${path}`, {
    ...rest,
    headers: {
      ...(rest.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`
    }
  });

  assert.equal(
    response.status,
    expected,
    `${rest.method ?? "GET"} ${path} expected ${expected}, got ${response.status}: ${await response.clone().text()}`
  );
  return response;
}

export async function createUploadUrl(params: {
  base: string;
  token: string;
  fileName: string;
  mimeType: string;
  body: Uint8Array | Buffer;
}): Promise<{ documentId: string; objectKey: string; uploadUrl: string; headers: Record<string, string> }> {
  const response = await api(params.base, params.token, "/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.body.byteLength
    }),
    expect: 201
  });

  const payload = (await response.json()) as {
    documentId?: string;
    objectKey?: string;
    uploadUrl?: string;
    headers?: Record<string, string>;
  };
  assert.ok(payload.documentId, "documentId in upload-url response");
  assert.ok(payload.objectKey, "objectKey in upload-url response");
  assert.ok(payload.uploadUrl, "uploadUrl in upload-url response");

  return {
    documentId: payload.documentId,
    objectKey: payload.objectKey,
    uploadUrl: payload.uploadUrl,
    headers: payload.headers ?? {}
  };
}

export async function putPresignedObject(upload: { uploadUrl: string; headers: Record<string, string> }, body: Uint8Array | Buffer) {
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body
  });
  assert.ok(response.ok, `presigned PUT failed: ${response.status} ${await response.text()}`);
}
