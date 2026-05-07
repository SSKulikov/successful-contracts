import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getStorageService } from "../src/services/StorageService/factory";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

type AttachmentRow = {
  id: bigint;
  document_id: bigint;
  company_id: bigint | null;
  file_name: string;
  original_name: string;
  mime_type: string | null;
  object_key: string | null;
};

function getRawBucket(): string {
  const bucket = process.env.S3_BUCKET_RAW?.trim();
  if (!bucket) throw new Error("Missing required env var: S3_BUCKET_RAW");
  return bucket;
}

function getAttachmentsRoot(): string {
  return path.resolve(process.cwd(), "uploads", "documents");
}

function buildAttachmentObjectKey(row: AttachmentRow): string {
  const companyPart = row.company_id == null ? "no-company" : String(row.company_id);
  return `attachments/${companyPart}/${row.document_id}/${row.file_name}`;
}

async function ensureAttachmentStorageColumns(): Promise<void> {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db_name: string }>>("SELECT DATABASE() AS db_name");
  const dbName = dbRows[0]?.db_name;
  if (!dbName) throw new Error("Unable to resolve current database");

  const addColumnIfMissing = async (columnName: string, ddl: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'document_attachments' AND COLUMN_NAME = ?`,
      dbName,
      columnName
    );
    if (Number(rows[0]?.cnt ?? 0) === 0) await prisma.$executeRawUnsafe(ddl);
  };

  const addIndexIfMissing = async (indexName: string, ddl: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'document_attachments' AND INDEX_NAME = ?`,
      dbName,
      indexName
    );
    if (Number(rows[0]?.cnt ?? 0) === 0) await prisma.$executeRawUnsafe(ddl);
  };

  await addColumnIfMissing("storage_provider", "ALTER TABLE document_attachments ADD COLUMN storage_provider VARCHAR(16) NOT NULL DEFAULT 'local'");
  await addColumnIfMissing("bucket", "ALTER TABLE document_attachments ADD COLUMN bucket VARCHAR(255) NULL");
  await addColumnIfMissing("object_key", "ALTER TABLE document_attachments ADD COLUMN object_key VARCHAR(768) NULL");
  await addColumnIfMissing("size_bytes", "ALTER TABLE document_attachments ADD COLUMN size_bytes BIGINT UNSIGNED NULL");
  await addColumnIfMissing("checksum_sha256", "ALTER TABLE document_attachments ADD COLUMN checksum_sha256 CHAR(64) NULL");
  await addIndexIfMissing("idx_doc_attachments_object_key", "CREATE INDEX idx_doc_attachments_object_key ON document_attachments(object_key)");
}

async function main(): Promise<void> {
  await ensureAttachmentStorageColumns();

  const bucket = getRawBucket();
  const storage = getStorageService();
  const rows = await prisma.$queryRawUnsafe<AttachmentRow[]>(
    `
      SELECT id, document_id, company_id, file_name, original_name, mime_type, object_key
      FROM document_attachments
      ORDER BY id ASC
    `
  );

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const localPath = path.join(getAttachmentsRoot(), path.basename(row.file_name));
    const objectKey = row.object_key || buildAttachmentObjectKey(row);

    if (row.object_key) {
      try {
        await storage.headObject({ bucket, key: objectKey });
        skipped += 1;
        continue;
      } catch {
        console.warn(`repair missing S3 object: attachment=${row.id} key=${objectKey}`);
      }
    }

    if (!fs.existsSync(localPath)) {
      console.warn(`skip missing local file: attachment=${row.id} path=${localPath}`);
      skipped += 1;
      continue;
    }

    const fileBuffer = await fs.promises.readFile(localPath);
    const checksumSha256 = createHash("sha256").update(fileBuffer).digest("hex");

    await storage.putObject({
      bucket,
      key: objectKey,
      body: fileBuffer,
      contentType: row.mime_type ?? undefined,
      contentLength: fileBuffer.length,
      metadata: {
        originalName: encodeURIComponent(row.original_name)
      }
    });

    const metadata = await storage.headObject({ bucket, key: objectKey });
    if (metadata.contentLength !== fileBuffer.length) {
      throw new Error(`size mismatch after upload: attachment=${row.id} local=${fileBuffer.length} s3=${metadata.contentLength}`);
    }

    await prisma.$executeRawUnsafe(
      `
        UPDATE document_attachments
        SET storage_provider = 's3', bucket = ?, object_key = ?, size_bytes = ?, checksum_sha256 = ?
        WHERE id = ?
      `,
      bucket,
      objectKey,
      fileBuffer.length,
      checksumSha256,
      row.id
    );

    migrated += 1;
    console.log(`migrated attachment=${row.id} key=${objectKey} size=${fileBuffer.length} sha256=${checksumSha256}`);
  }

  console.log(`done: migrated=${migrated} skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
