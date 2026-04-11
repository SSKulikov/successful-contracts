import Redis from "ioredis";
import { logger } from "../utils/logger";

let redisClient: Redis | null = null;
let redisDisabled = false;

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
    enableReadyCheck: true
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
      logger.error(`❌ Redis connect failed, fallback to DB: ${error}`);
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

