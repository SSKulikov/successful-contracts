/**
 * Проверяет, что production/staging окружение содержит секреты для VPS MySQL и S3.
 * Значения не печатаются.
 */

import dotenv from "dotenv";

dotenv.config();

const REQUIRED = [
  "DATABASE_URL",
  "JWT_SECRET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET_RAW",
  "S3_BUCKET_PROCESSED",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "PUBLIC_APP_URL",
  "CORS_ORIGIN"
];

const missing = REQUIRED.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error(`Missing required production secrets/env: ${missing.join(", ")}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.startsWith("mysql://")) {
  console.error("DATABASE_URL must start with mysql://");
  process.exit(1);
}

if ((process.env.JWT_SECRET ?? "").includes("change-me")) {
  console.error("JWT_SECRET must not be a placeholder");
  process.exit(1);
}

console.log(`Production env check OK: ${REQUIRED.length} required keys are present.`);

