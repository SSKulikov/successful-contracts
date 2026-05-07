import path from "path";
import type { StorageService } from "./index";
import { LocalStorageService } from "./LocalStorageService";
import { S3StorageService } from "./S3StorageService";

let storageService: StorageService | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getStorageService(): StorageService {
  if (storageService) return storageService;

  const defaultProvider = process.env.S3_ENDPOINT ? "s3" : "local";
  const provider = (process.env.STORAGE_PROVIDER ?? defaultProvider).trim().toLowerCase();

  if (provider === "s3") {
    storageService = new S3StorageService({
      endpoint: readRequiredEnv("S3_ENDPOINT"),
      region: readRequiredEnv("S3_REGION"),
      accessKeyId: readRequiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: readRequiredEnv("S3_SECRET_ACCESS_KEY"),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      defaultUploadTtlSeconds: readPositiveIntEnv("S3_PRESIGNED_UPLOAD_TTL_SEC", 900),
      defaultDownloadTtlSeconds: readPositiveIntEnv("S3_PRESIGNED_DOWNLOAD_TTL_SEC", 900)
    });
    return storageService;
  }

  if (provider === "local") {
    storageService = new LocalStorageService(
      process.env.LOCAL_STORAGE_ROOT ?? path.resolve(process.cwd(), "storage")
    );
    return storageService;
  }

  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}
