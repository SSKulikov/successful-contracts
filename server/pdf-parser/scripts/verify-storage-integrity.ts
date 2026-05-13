/**
 * Проверка целостности: счётчики по статусам, вложения с/без S3, HeadObject vs size_bytes в БД,
 * UUID-документы (documents) — размер оригинала и наличие processed в S3 для status=done.
 * Код выхода 1 при любой ошибке проверки.
 */
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getStorageService, isS3StorageEnabled } from "../src/services/StorageService/factory";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    tableName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main(): Promise<void> {
  const errors: string[] = [];

  if (!isS3StorageEnabled()) {
    console.log("S3 выключен — проверки Object Storage пропущены (локальный режим).");
    await prisma.$disconnect();
    return;
  }

  const storage = getStorageService();

  if (await tableExists("document_attachments")) {
    const attachStats = await prisma.$queryRawUnsafe<
      { total: bigint; with_s3: bigint; without_s3: bigint }[]
    >(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN bucket IS NOT NULL AND object_key IS NOT NULL AND bucket <> '' AND object_key <> '' THEN 1 ELSE 0 END) AS with_s3,
      SUM(CASE WHEN bucket IS NULL OR object_key IS NULL OR bucket = '' OR object_key = '' THEN 1 ELSE 0 END) AS without_s3
    FROM document_attachments
  `);
  const s = attachStats[0];
  console.log(
    `document_attachments: total=${s?.total ?? 0n} with_s3_keys=${s?.with_s3 ?? 0n} without_s3_keys=${s?.without_s3 ?? 0n}`
  );
  if (s && Number(s.without_s3) > 0) {
    errors.push(`${s.without_s3} вложений без bucket/object_key (чтение в S3-режиме вернёт 404 до синхронизации)`);
  }

  const rows = await prisma.$queryRawUnsafe<
    { id: bigint; bucket: string; object_key: string; size_bytes: bigint | null }[]
  >(
    `SELECT id, bucket, object_key, size_bytes FROM document_attachments
     WHERE bucket IS NOT NULL AND object_key IS NOT NULL AND bucket <> '' AND object_key <> ''`
  );

  for (const r of rows) {
    try {
      const meta = await storage.headObject({ bucket: r.bucket, key: r.object_key });
      const len = meta.contentLength;
      if (len == null) {
        errors.push(`attachment id=${r.id}: HeadObject без Content-Length`);
        continue;
      }
      if (r.size_bytes != null && BigInt(len) !== r.size_bytes) {
        errors.push(
          `attachment id=${r.id}: size_bytes в БД (${r.size_bytes}) != S3 Content-Length (${len})`
        );
      }
    } catch (e) {
      errors.push(`attachment id=${r.id}: HeadObject failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  } else {
    console.log("document_attachments: таблица отсутствует — проверки вложений пропущены.");
  }

  if (!(await tableExists("documents"))) {
    console.log("documents: таблица отсутствует — проверки UUID-документов пропущены.");
  } else {
  const docStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
    `SELECT processing_status AS status, COUNT(*) AS c FROM documents GROUP BY processing_status`
  );
  console.log("documents by status:", Object.fromEntries(docStatus.map((x) => [x.status, String(x.c)])));

  const docs = await prisma.document.findMany({
    select: {
      id: true,
      bucket: true,
      objectKey: true,
      sizeBytes: true,
      processingStatus: true
    }
  });

  for (const d of docs) {
    try {
      const meta = await storage.headObject({ bucket: d.bucket, key: d.objectKey });
      const len = meta.contentLength;
      if (len == null) {
        errors.push(`document ${d.id}: HeadObject original без Content-Length`);
      } else if (BigInt(len) !== d.sizeBytes) {
        errors.push(
          `document ${d.id}: sizeBytes в БД (${d.sizeBytes}) != S3 (${len})`
        );
      }
    } catch (e) {
      errors.push(`document ${d.id}: HeadObject original: ${e instanceof Error ? e.message : e}`);
    }

    if (d.processingStatus === "done") {
      const content = await prisma.documentContent.findFirst({
        where: { documentId: d.id },
        orderBy: { version: "desc" },
        select: { processedBucket: true, processedObjectKey: true }
      });
      if (!content?.processedBucket || !content.processedObjectKey) {
        errors.push(`document ${d.id}: status done но нет processed_bucket/object_key в document_contents`);
        continue;
      }
      try {
        await storage.headObject({
          bucket: content.processedBucket,
          key: content.processedObjectKey
        });
      } catch (e) {
        errors.push(
          `document ${d.id}: HeadObject processed failed: ${e instanceof Error ? e.message : e}`
        );
      }
    }
  }
  }

  if (errors.length > 0) {
    console.error("--- Ошибки целостности ---");
    for (const line of errors) console.error(line);
    process.exitCode = 1;
  } else {
    console.log("Проверка целостности: ошибок не найдено.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
