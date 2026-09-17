import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression guard for the second half of the owner-lockout defect.
 *
 * The first half — minLength on the login form — was removed earlier, and a
 * test pins that down. But the same rule survived on the server: the API
 * rejected any code shorter than twelve characters *before* comparing it, and
 * answered "رمز الوصول غير صحيح" — telling the owner their code was wrong when
 * it was in fact correct and simply short. A short configured code could
 * therefore never unlock the system, whatever was set in the environment.
 *
 * The fixtures below are deliberately arbitrary: this repository is public, so
 * a test must never mirror the code a deployment actually uses.
 *
 * Length is not the server's business here. Brute force is stopped by the rate
 * limit; weak codes are reported by the readiness gate. These tests hold that
 * line on the endpoint itself.
 */

vi.mock("@/lib/supabase", () => ({
  // No database in this test: the route falls back to its in-memory limiter.
  getSupabaseAdmin: () => null,
}));

import { POST } from "@/app/api/owner-access/route";
import { OWNER_ACCESS_COOKIE, verifyOwnerAccessToken } from "@/lib/security/personalAccess";

const ENV_KEYS = [
  "ORVANTA_OWNER_ACCESS_KEY",
  "API_SECRET_KEY",
  "ORVANTA_OWNER_COOKIE_SECRET",
  "ORVANTA_COOKIE_SECURE",
] as const;
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function request(code: unknown, ip = `10.0.0.${Math.floor(Math.random() * 250) + 1}`) {
  return new Request("http://localhost/api/owner-access", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ code }),
    // The handler only reads json(), headers and cookies, all of which the
    // standard Request provides.
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.ORVANTA_OWNER_COOKIE_SECRET = "test-cookie-signing-secret-0123456789";
  process.env.ORVANTA_COOKIE_SECURE = "false";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key] as string;
  }
});

describe("owner access endpoint imposes no length rule on the code", () => {
  it("unlocks with a short configured code, and issues a valid session cookie", async () => {
    process.env.ORVANTA_OWNER_ACCESS_KEY = "864209753";

    const response = await POST(request("864209753"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);

    // The cookie must be real, not merely present.
    const token = response.cookies.get(OWNER_ACCESS_COOKIE)?.value;
    expect(token).toBeTruthy();
    await expect(verifyOwnerAccessToken(token)).resolves.toBe(true);
  });

  it("unlocks with a one-character configured code", async () => {
    process.env.ORVANTA_OWNER_ACCESS_KEY = "x";
    const response = await POST(request("x"));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });

  it("still rejects a code that does not match the configured one", async () => {
    process.env.ORVANTA_OWNER_ACCESS_KEY = "864209753";
    const response = await POST(request("135792468"));
    expect(response.status).toBe(401);
    expect(response.cookies.get(OWNER_ACCESS_COOKIE)?.value).toBeFalsy();
  });

  it("rejects an empty code instead of treating it as a match", async () => {
    process.env.ORVANTA_OWNER_ACCESS_KEY = "864209753";
    expect((await POST(request(""))).status).toBe(401);
  });

  it("answers 503 when no owner code is configured at all", async () => {
    const response = await POST(request("864209753"));
    expect(response.status).toBe(503);
  });
});

describe("the length rule must not come back", () => {
  it("has no minimum-length comparison in the owner-access route", () => {
    const source = readFileSync("app/api/owner-access/route.ts", "utf8");
    // Guards against `code.length < N` in any spacing. The upper bound that
    // rejects an oversized body is fine and deliberately not matched here.
    expect(source).not.toMatch(/code\.length\s*<\s*\d/);
  });
});
