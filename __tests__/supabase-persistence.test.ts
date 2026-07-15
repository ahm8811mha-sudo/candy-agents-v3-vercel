import { afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import {
  persist,
  fetchRows,
  getSupabaseEnvironmentReadiness,
  hydrateOnce,
  hasSupabaseEnv,
} from "../lib/supabase";

const SUPABASE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const originalEnvironment = Object.fromEntries(SUPABASE_ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of SUPABASE_ENV_KEYS) delete process.env[key];
});

afterAll(() => {
  for (const key of SUPABASE_ENV_KEYS) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Supabase persistence helpers (graceful degradation)", () => {
  it("is not configured in the test environment", () => {
    // These tests assert the no-Supabase fallback path stays safe.
    expect(hasSupabaseEnv()).toBe(false);
  });

  it("reports only safe names for missing configuration", () => {
    const readiness = getSupabaseEnvironmentReadiness();

    expect(readiness).toMatchObject({ configured: false, hasUrl: false, hasServerKey: false, keySource: null });
    expect(readiness.missingEnvironmentVariables).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL (أو SUPABASE_URL)",
      "SUPABASE_SECRET_KEY (أو SUPABASE_SERVICE_ROLE_KEY)",
    ]);
  });

  it("recognizes the current Supabase secret-key name", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test-value-never-returned";

    const readiness = getSupabaseEnvironmentReadiness();
    expect(readiness).toMatchObject({ configured: true, hasUrl: true, hasServerKey: true, keySource: "SUPABASE_SECRET_KEY" });
    expect(JSON.stringify(readiness)).not.toContain("test-value-never-returned");
  });

  it("retains support for the legacy service-role name", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-test-key";

    expect(getSupabaseEnvironmentReadiness()).toMatchObject({
      configured: true,
      keySource: "SUPABASE_SERVICE_ROLE_KEY",
    });
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
