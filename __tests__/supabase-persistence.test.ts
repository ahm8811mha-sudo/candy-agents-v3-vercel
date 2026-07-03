import { describe, it, expect, vi } from "vitest";
import { persist, fetchRows, hydrateOnce, hasSupabaseEnv } from "../lib/supabase";

describe("Supabase persistence helpers (graceful degradation)", () => {
  it("is not configured in the test environment", () => {
    // These tests assert the no-Supabase fallback path stays safe.
    expect(hasSupabaseEnv()).toBe(false);
  });

  it("persist is a silent no-op without env (never throws)", () => {
    expect(() => persist("company_approvals", { id: "x", status: "PENDING" })).not.toThrow();
  });

  it("fetchRows returns [] without env", async () => {
    expect(await fetchRows("company_ideas", { orderBy: "created_at" })).toEqual([]);
  });

  it("hydrateOnce short-circuits (does not run fn) when unconfigured", async () => {
    const fn = vi.fn(async () => {});
    const hydrate = hydrateOnce(fn);
    await hydrate();
    await hydrate();
    expect(fn).not.toHaveBeenCalled();
  });

  it("hydrateOnce runs its fn at most once and shares the in-flight promise", async () => {
    // Force the env gate open just for this case to exercise the run-once guard.
    let resolveFn: () => void = () => {};
    const fn = vi.fn(() => new Promise<void>((r) => { resolveFn = r; }));
    const hydrate = hydrateOnce(fn);
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    try {
      const a = hydrate();
      const b = hydrate();
      expect(fn).toHaveBeenCalledTimes(1); // concurrent callers share one run
      resolveFn();
      await Promise.all([a, b]);
      await hydrate();
      expect(fn).toHaveBeenCalledTimes(1); // memoized after success
    } finally {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });
});
