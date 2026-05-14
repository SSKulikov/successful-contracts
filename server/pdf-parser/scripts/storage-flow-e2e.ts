/**
 * E2E для нового S3/VPS storage-flow:
 * upload-url -> direct PUT to S3 -> complete -> done
 * upload-url -> direct PUT invalid PDF -> complete -> failed
 *
 * Переменные:
 * - STAGING_API_URL=http://localhost:3003/api
 * - STAGING_EMAIL / STAGING_PASSWORD
 *
 * Скрипт пропускается без STAGING_API_URL, как остальные staging e2e.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import prisma from "../src/prisma";
import { getStorageService } from "../src/services/StorageService/factory";
import { api, createUploadUrl, getApiBase, login, putPresignedObject } from "./storage-e2e-helpers";

type CreatedStorageDocument = {
  documentId: string;
  ownerId: number;
  bucket: string;
  objectKey: string;
};

async function createSimplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Storage E2E contract. Supplier Example LLC. Customer Example LLC. Amount 1000 RUB.", {
    x: 72,
    y: 760,
    size: 14,
    font
  });
  return pdf.save();
}

async function dirSizeBytes(dir: string): Promise<number> {
  try {
    const stat = await fs.promises.stat(dir);
    if (stat.isFile()) return stat.size;
  } catch {
    return 0;
  }

  let total = 0;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSizeBytes(child);
    else if (entry.isFile()) total += (await fs.promises.stat(child)).size;
  }
  return total;
}

async function runDoneFlow(base: string, token: string, ownerId: number, created: CreatedStorageDocument[]): Promise<void> {
  const body = await createSimplePdf();
  const upload = await createUploadUrl({
    base,
    token,
    fileName: `storage-e2e-${Date.now()}.pdf`,
    mimeType: "application/pdf",
    body
  });
  created.push({
    documentId: upload.documentId,
    ownerId,
    bucket: process.env.S3_BUCKET_RAW ?? "",
    objectKey: upload.objectKey
  });

  await putPresignedObject(upload, Buffer.from(body));
  const complete = await api(base, token, `/documents/${upload.documentId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const completePayload = (await complete.json()) as { processingStatus?: string; processingError?: string | null };
  assert.equal(
    completePayload.processingStatus,
    "done",
    `expected done, got ${completePayload.processingStatus}: ${completePayload.processingError ?? ""}`
  );

  const status = await api(base, token, `/documents/${upload.documentId}/status`);
  const statusPayload = (await status.json()) as { processingStatus?: string; processingError?: string | null };
  assert.equal(statusPayload.processingStatus, "done");
  assert.equal(statusPayload.processingError, null);

  const originalUrl = await api(base, token, `/documents/${upload.documentId}/download-url?variant=original`);
  const originalPayload = (await originalUrl.json()) as { downloadUrl?: string };
  assert.ok(originalPayload.downloadUrl, "original downloadUrl");

  const processedUrl = await api(base, token, `/documents/${upload.documentId}/download-url?variant=processed`);
  const processedPayload = (await processedUrl.json()) as { downloadUrl?: string };
  assert.ok(processedPayload.downloadUrl, "processed downloadUrl");

  console.log(`[storage-flow-e2e] done-flow OK: ${upload.documentId}`);
}

async function runFailedFlow(base: string, token: string, ownerId: number, created: CreatedStorageDocument[]): Promise<void> {
  const body = Buffer.from("not a real pdf");
  const upload = await createUploadUrl({
    base,
    token,
    fileName: `storage-e2e-invalid-${Date.now()}.pdf`,
    mimeType: "application/pdf",
    body
  });
  created.push({
    documentId: upload.documentId,
    ownerId,
    bucket: process.env.S3_BUCKET_RAW ?? "",
    objectKey: upload.objectKey
  });

  await putPresignedObject(upload, body);
  const complete = await api(base, token, `/documents/${upload.documentId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    expect: 500
  });
  const completePayload = (await complete.json()) as { processingStatus?: string; processingError?: string | null };
  assert.equal(completePayload.processingStatus, "failed");
  assert.ok(completePayload.processingError, "processingError for failed document");

  const status = await api(base, token, `/documents/${upload.documentId}/status`);
  const statusPayload = (await status.json()) as { processingStatus?: string; processingError?: string | null };
  assert.equal(statusPayload.processingStatus, "failed");
  assert.ok(statusPayload.processingError, "status processingError");

  console.log(`[storage-flow-e2e] failed-flow OK: ${upload.documentId}`);
}

async function cleanupCreatedDocuments(created: CreatedStorageDocument[]): Promise<void> {
  if (process.env.STORAGE_E2E_KEEP_DOCS === "1") return;

  const storage = getStorageService();
  await Promise.allSettled(
    created.flatMap((doc) => [
      storage.deleteObject({ bucket: doc.bucket, key: doc.objectKey }),
      storage.deleteObject({
        bucket: process.env.S3_BUCKET_PROCESSED ?? "",
        key: `documents/${doc.ownerId}/${doc.documentId}/parsed.json`
      })
    ])
  );
  if (created.length > 0) {
    await prisma.document.deleteMany({
      where: {
        id: {
          in: created.map((doc) => doc.documentId)
        }
      }
    });
  }
}

async function main() {
  const base = getApiBase();
  if (!base) {
    console.log("[storage-flow-e2e] SKIP: задайте STAGING_API_URL (например http://localhost:3003/api)");
    return;
  }

  const { token, employeeId } = await login(base);
  const storageDir = path.resolve(process.cwd(), "storage");
  const beforeBytes = await dirSizeBytes(storageDir);
  const created: CreatedStorageDocument[] = [];

  try {
    await runDoneFlow(base, token, employeeId, created);
    await runFailedFlow(base, token, employeeId, created);

    const afterBytes = await dirSizeBytes(storageDir);
    const growthBytes = afterBytes - beforeBytes;
    const allowedGrowthBytes = Number(process.env.STORAGE_E2E_MAX_LOCAL_GROWTH_BYTES ?? 64 * 1024);
    assert.ok(
      growthBytes <= allowedGrowthBytes,
      `local storage grew by ${growthBytes} bytes, allowed ${allowedGrowthBytes}`
    );
    console.log(`[storage-flow-e2e] local storage growth OK: ${growthBytes} bytes`);
  } finally {
    await cleanupCreatedDocuments(created);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  prisma.$disconnect().finally(() => process.exit(1));
});
