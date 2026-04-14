import { createHash } from "crypto";

/** SHA-256 (hex) от сырого содержимого файла — для ключа кэша пайплайна парсинга. */
export function sha256HexOfFileBytes(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Рекурсивно сортирует ключи объекта для детерминированного JSON. */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeysDeep(obj[k]);
  }
  return sorted;
}

/**
 * SHA-256 шестнадцатеричная строка от канонического JSON нормализованных данных
 * (после валидации/нормализации, напр. `ValidatorService.validateParsedData`).
 */
export function sha256HexOfStableJson(value: unknown): string {
  const canonical = JSON.stringify(sortKeysDeep(value));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
