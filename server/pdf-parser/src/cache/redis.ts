import Redis from "ioredis";
import { logger } from "../utils/logger";

let redisClient: Redis | null = null;
let redisDisabled = false;

function disableRedis(reason: unknown) {
  logger.error(`❌ Redis disabled, fallback to DB: ${reason}`);
  redisDisabled = true;
  if (redisClient) {
    redisClient.removeAllListeners();
    redisClient.disconnect();
    redisClient = null;
  }
}

function getRedisClient(): Redis | null {
  if (redisDisabled) return null;
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    redisDisabled = true;
    return null;
  }

  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    retryStrategy: () => null
  });

  redisClient.on("error", (error) => {
    logger.error(`❌ Redis error: ${error}`);
  });

  return redisClient;
}

async function connectIfNeeded() {
  const client = getRedisClient();
  if (!client) return null;

  if (client.status === "wait") {
    try {
      await client.connect();
    } catch (error) {
      disableRedis(error);
      return null;
    }
  }

  if (client.status !== "ready" && client.status !== "connect") {
    return null;
  }

  return client;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const client = await connectIfNeeded();
  if (!client) return null;

  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error(`❌ Redis getJson failed for key "${key}": ${error}`);
    return null;
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds = 120): Promise<void> {
  const client = await connectIfNeeded();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    logger.error(`❌ Redis setJson failed for key "${key}": ${error}`);
  }
}

export async function del(key: string): Promise<void> {
  const client = await connectIfNeeded();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    logger.error(`❌ Redis del failed for key "${key}": ${error}`);
  }
}

/** Удаляет все ключи по шаблону (SCAN + DEL). Для инвалидации группы ключей, напр. кэш списков документов по компании. */
export async function scanDelByPattern(pattern: string): Promise<void> {
  const client = await connectIfNeeded();
  if (!client) return;

  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", "200");
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    logger.error(`❌ Redis scanDelByPattern failed for "${pattern}": ${error}`);
  }
}

export function getMyDocumentsListCachePattern(companyId: number | null): string {
  const part = companyId === null ? "none" : String(companyId);
  return `my-docs:${part}:*`;
}

export async function invalidateMyDocumentsListCaches(companyId: number | null): Promise<void> {
  await scanDelByPattern(getMyDocumentsListCachePattern(companyId));
}

/** После изменения документа: кэш списка по компании + списки платформенного админа (`my-docs:all:*`). */
export async function invalidateMyDocumentsListCachesAfterMutation(documentCompanyId: number | null): Promise<void> {
  await invalidateMyDocumentsListCaches(documentCompanyId);
  await scanDelByPattern("my-docs:all:*");
}

const PARSE_NORM_SHA256_KEY_PREFIX = "parse:norm-sha256:";
const DEFAULT_PARSE_NORM_HASH_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Сохраняет SHA-256 нормализованного JSON результата парсинга (после LLM + ValidatorService).
 * Ключ — имя загруженного файла в storage (`req.file.filename`), значение — hex SHA-256.
 */
const DEFAULT_PARSE_PIPELINE_CACHE_PREFIX = "parse:pipeline";
const DEFAULT_PARSE_PIPELINE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 3;

/** Ключ кэша полного пайплайна (OCR / чанки / GigaChat): `префикс_хэш-содержимого`. Префикс — `PARSE_PIPELINE_CACHE_KEY_PREFIX`. */
export function buildParsePipelineCacheKey(contentSha256Hex: string): string {
  const prefix =
    process.env.PARSE_PIPELINE_CACHE_KEY_PREFIX?.trim() || DEFAULT_PARSE_PIPELINE_CACHE_PREFIX;
  return `${prefix}_${contentSha256Hex}`;
}

export function getParsePipelineCacheTtlSeconds(): number {
  const raw = process.env.PARSE_PIPELINE_CACHE_TTL_SECONDS;
  const n = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PARSE_PIPELINE_CACHE_TTL_SECONDS;
}

export async function setParseNormalizedDataHash(uploadFileName: string, sha256Hex: string): Promise<void> {
  const client = await connectIfNeeded();
  if (!client) return;

  const ttlRaw = process.env.PARSE_RESULT_HASH_TTL_SECONDS;
  const parsed = ttlRaw !== undefined ? Number(ttlRaw) : NaN;
  const ttlSec =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PARSE_NORM_HASH_TTL_SECONDS;

  const key = `${PARSE_NORM_SHA256_KEY_PREFIX}${uploadFileName}`;
  try {
    await client.set(key, sha256Hex, "EX", ttlSec);
  } catch (error) {
    logger.error(`❌ Redis setParseNormalizedDataHash failed for "${key}": ${error}`);
  }
}
