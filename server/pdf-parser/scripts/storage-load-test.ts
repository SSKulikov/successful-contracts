/**
 * Нагрузочный smoke для конкурентных presigned uploads.
 *
 * По умолчанию проверяет upload-url + direct PUT и чистит созданные записи/объекты.
 * Полный complete можно включить STORAGE_LOAD_COMPLETE=1, но это запускает парсер и LLM/OCR.
 *
 * Переменные:
 * - STAGING_API_URL
 * - STAGING_EMAIL / STAGING_PASSWORD
 * - STORAGE_LOAD_TOTAL=20
 * - STORAGE_LOAD_CONCURRENCY=5
 * - STORAGE_LOAD_COMPLETE=0|1
 */

import assert from "node:assert/strict";
import prisma from "../src/prisma";
import { getStorageService } from "../src/services/StorageService/factory";
import { api, createUploadUrl, getApiBase, login, putPresignedObject } from "./storage-e2e-helpers";

type CreatedDoc = {
  id: string;
  bucket: string;
  objectKey: string;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function runPool(total: number, concurrency: number, task: (index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(total, concurrency) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= total) return;
      await task(index);
    }
  });
  await Promise.all(workers);
}

async function cleanup(created: CreatedDoc[]): Promise<void> {
  const storage = getStorageService();
  await Promise.allSettled(
    created.map((doc) => storage.deleteObject({ bucket: doc.bucket, key: doc.objectKey }))
  );
  await prisma.document.deleteMany({
    where: {
      id: {
        in: created.map((doc) => doc.id)
      }
    }
  });
}

async function main() {
  const base = getApiBase();
  if (!base) {
    console.log("[storage-load-test] SKIP: задайте STAGING_API_URL (например http://localhost:3003/api)");
    return;
  }

  const total = parsePositiveInt(process.env.STORAGE_LOAD_TOTAL, 20);
  const concurrency = parsePositiveInt(process.env.STORAGE_LOAD_CONCURRENCY, 5);
  const shouldComplete = process.env.STORAGE_LOAD_COMPLETE === "1";
  const { token } = await login(base);
  const created: CreatedDoc[] = [];
  const started = Date.now();

  try {
    await runPool(total, concurrency, async (index) => {
      const body = Buffer.from(`storage load ${Date.now()} ${index}`);
      const upload = await createUploadUrl({
        base,
        token,
        fileName: `storage-load-${Date.now()}-${index}.txt`,
        mimeType: "text/plain",
        body
      });
      created.push({
        id: upload.documentId,
        bucket: process.env.S3_BUCKET_RAW ?? "",
        objectKey: upload.objectKey
      });
      await putPresignedObject(upload, body);

      if (shouldComplete) {
        const complete = await api(base, token, `/documents/${upload.documentId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          expect: 500
        });
        const payload = (await complete.json()) as { processingStatus?: string };
        assert.equal(payload.processingStatus, "failed", "text/plain complete должен контролируемо падать");
      }
    });

    const durationMs = Date.now() - started;
    console.log(
      `[storage-load-test] OK: total=${total}, concurrency=${concurrency}, complete=${shouldComplete}, durationMs=${durationMs}`
    );
  } finally {
    await cleanup(created);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

