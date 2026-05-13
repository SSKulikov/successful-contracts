/**
 * Синхронизирует метаданные вложений (document_attachments) с Object Storage:
 * — для строк с bucket+object_key: storage_provider=s3, size_bytes из HeadObject;
 * — для строк без bucket/key: пробует канонический ключ `attachments/{company|no-company}/{document_id}/{file_name}` в RAW-бакете;
 *   если объект есть в S3 — дописывает bucket/object_key/size_bytes в MySQL.
 *
 * Перед запуском при необходимости выполните: npm run migrate:attachments-to-s3
 * Требуется .env с DATABASE_URL и S3_* (режим STORAGE_PROVIDER=s3).
 */
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getStorageService, isS3StorageEnabled } from "../src/services/StorageService/factory";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

function getRawBucket(): string {
  const bucket = process.env.S3_BUCKET_RAW?.trim();
  if (!bucket) throw new Error("Missing required env var: S3_BUCKET_RAW");
  return bucket;
}

function buildAttachmentObjectKey(companyId: bigint | null, documentId: bigint, fileName: string): string {
  const companyPart = companyId == null ? "no-company" : String(companyId);
  return `attachments/${companyPart}/${documentId}/${fileName}`;
}

type Row = {
  id: bigint;
  document_id: bigint;
  company_id: bigint | null;
  file_name: string;
  bucket: string | null;
  object_key: string | null;
};

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    tableName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main(): Promise<void> {
  if (!isS3StorageEnabled()) {
    console.error("S3 не включён (нет S3_ENDPOINT или STORAGE_PROVIDER=local). Скрипт не применим.");
    process.exitCode = 1;
    return;
  }

  if (!(await tableExists("document_attachments"))) {
    console.log("Таблица document_attachments ещё не создана (обычно после первого использования вложений). Нечего синхронизировать.");
    return;
  }

  const rawBucket = getRawBucket();
  const storage = getStorageService();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, document_id, company_id, file_name, bucket, object_key FROM document_attachments ORDER BY id ASC`
  );

  let updated = 0;
  let skipped = 0;
  let repairedKeys = 0;

  for (const row of rows) {
    let bucket = row.bucket?.trim() || null;
    let objectKey = row.object_key?.trim() || null;

    if (!bucket || !objectKey) {
      objectKey = buildAttachmentObjectKey(row.company_id, row.document_id, row.file_name);
      bucket = rawBucket;
      try {
        await storage.headObject({ bucket, key: objectKey });
      } catch {
        console.warn(
          `skip id=${row.id}: нет bucket/key в БД и объект не найден в S3 по ключу ${objectKey} (нужна migrate:attachments-to-s3)`
        );
        skipped += 1;
        continue;
      }
      repairedKeys += 1;
    }

    const meta = await storage.headObject({ bucket: bucket!, key: objectKey! });
    const sizeBytes = meta.contentLength ?? null;
    if (sizeBytes == null) {
      console.warn(`skip id=${row.id}: HeadObject без Content-Length`);
      skipped += 1;
      continue;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE document_attachments
       SET storage_provider = 's3', bucket = ?, object_key = ?, size_bytes = ?
       WHERE id = ?`,
      bucket,
      objectKey,
      sizeBytes,
      row.id
    );
    updated += 1;
  }

  console.log(`done: updated=${updated} repaired_missing_keys=${repairedKeys} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
