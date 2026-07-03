import { describe, it, expect, vi } from "vitest";
import { getCached, setCache, invalidateCache, clearCache, withCache } from "../lib/cache";

describe("cache", () => {
  it("stores and retrieves values", () => {
    setCache("test-key-1", { data: "hello" });
    const result = getCached<{ data: string }>("test-key-1");
    expect(result?.data).toBe("hello");
  });

  it("returns null for missing keys", () => {
    const result = getCached("nonexistent-key");
    expect(result).toBeNull();
  });

  it("respects TTL", async () => {
    setCache("test-ttl", "value", 50);
    expect(getCached("test-ttl")).toBe("value");

    await new Promise((r) => setTimeout(r, 60));
    expect(getCached("test-ttl")).toBeNull();
  });

  it("invalidates by pattern", () => {
    setCache("prefix-a", 1);
    setCache("prefix-b", 2);
    setCache("other-c", 3);

    invalidateCache("prefix");

    expect(getCached("prefix-a")).toBeNull();
    expect(getCached("prefix-b")).toBeNull();
    expect(getCached("other-c")).toBe(3);
  });

  it("clears all cache", () => {
    setCache("clear-1", "a");
    setCache("clear-2", "b");

    clearCache();

    expect(getCached("clear-1")).toBeNull();
    expect(getCached("clear-2")).toBeNull();
  });

  it("withCache uses cache on second call", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh-data");
    const key = `wc-${Date.now()}`;

    const first = await withCache(key, 5000, fetcher);
    const second = await withCache(key, 5000, fetcher);

    expect(first).toBe("fresh-data");
    expect(second).toBe("fresh-data");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
