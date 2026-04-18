import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildParsePipelineCacheKey } from "../cache/redis";

describe("buildParsePipelineCacheKey", () => {
  it("suffixes content hash", () => {
    const k = buildParsePipelineCacheKey("deadbeef");
    assert.ok(k.endsWith("deadbeef"), k);
  });
});
