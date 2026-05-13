/**
 * Удаляет локальные копии вложений из uploads/documents, если в БД уже есть S3-ссылка и объект есть в бакете.
 * По умолчанию только dry-run. Удаление: npm run cleanup:local-attachment-files -- --execute
 */
import fs from "fs";
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

function getAttachmentsRoot(): string {
  return path.resolve(process.cwd(), "uploads", "documents");
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");

  if (!isS3StorageEnabled()) {
    console.error("S3 не включён — очистка локальных копий под вложения не выполняется.");
    process.exitCode = 1;
    return;
  }

  if (!(await tableExists("document_attachments"))) {
    console.log("Таблица document_attachments отсутствует — очистка не требуется.");
    return;
  }

  const root = getAttachmentsRoot();
  if (!fs.existsSync(root)) {
    console.log(`Каталог отсутствует: ${root} — удалять нечего.`);
    return;
  }

  const storage = getStorageService();
  const names = fs.readdirSync(root).filter((n) => !n.startsWith("."));
  let wouldDelete = 0;
  let deleted = 0;
  let kept = 0;

  for (const name of names) {
    const full = path.join(root, name);
    if (!fs.statSync(full).isFile()) {
      kept += 1;
      continue;
    }

    const rows = await prisma.$queryRawUnsafe<
      { bucket: string | null; object_key: string | null }[]
    >(
      `SELECT bucket, object_key FROM document_attachments WHERE file_name = ? ORDER BY id DESC LIMIT 1`,
      name
    );
    const row = rows[0];
    if (!row?.bucket || !row.object_key) {
      console.log(`keep (no S3 in DB): ${name}`);
      kept += 1;
      continue;
    }

    try {
      await storage.headObject({ bucket: row.bucket, key: row.object_key });
    } catch {
      console.log(`keep (S3 missing): ${name}`);
      kept += 1;
      continue;
    }

    wouldDelete += 1;
    if (execute) {
      fs.unlinkSync(full);
      deleted += 1;
      console.log(`deleted: ${name}`);
    } else {
      console.log(`[dry-run] would delete: ${name}`);
    }
  }

  console.log(
    execute
      ? `done: deleted=${deleted} kept=${kept}`
      : `dry-run: would_delete=${wouldDelete} kept=${kept}. Повторите с --execute для удаления.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
