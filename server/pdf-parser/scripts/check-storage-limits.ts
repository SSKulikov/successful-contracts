/**
 * Отчет по практическим лимитам VPS MySQL и Object Storage перед нагрузочными прогонами.
 * Не печатает секреты.
 */

import prisma from "../src/prisma";
import { getStorageService } from "../src/services/StorageService/factory";

async function main() {
  const variables = await prisma.$queryRawUnsafe<Array<{ Variable_name: string; Value: string }>>(
    `
      SHOW VARIABLES
      WHERE Variable_name IN (
        'max_connections',
        'max_allowed_packet',
        'wait_timeout',
        'interactive_timeout',
        'connect_timeout'
      )
    `
  );
  const status = await prisma.$queryRawUnsafe<Array<{ Variable_name: string; Value: string }>>(
    `
      SHOW STATUS
      WHERE Variable_name IN (
        'Threads_connected',
        'Threads_running',
        'Connections',
        'Aborted_connects'
      )
    `
  );

  console.log("[storage-limits] MySQL variables:", Object.fromEntries(variables.map((x) => [x.Variable_name, x.Value])));
  console.log("[storage-limits] MySQL status:", Object.fromEntries(status.map((x) => [x.Variable_name, x.Value])));

  const rawBucket = process.env.S3_BUCKET_RAW?.trim();
  const processedBucket = process.env.S3_BUCKET_PROCESSED?.trim();
  if (!rawBucket || !processedBucket) {
    throw new Error("S3_BUCKET_RAW and S3_BUCKET_PROCESSED are required");
  }

  const storage = getStorageService();
  for (const bucket of [rawBucket, processedBucket]) {
    const key = `smoke/limits-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    const body = Buffer.from("limits smoke");
    await storage.putObject({
      bucket,
      key,
      body,
      contentType: "text/plain",
      contentLength: body.byteLength
    });
    const meta = await storage.headObject({ bucket, key });
    await storage.deleteObject({ bucket, key });
    console.log(`[storage-limits] S3 bucket ${bucket}: put/head/delete OK, contentLength=${meta.contentLength}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

