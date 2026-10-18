// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OWNER_ACCESS_COOKIE, verifyOwnerAccessToken } from "@/lib/security/personalAccess";

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ rpc: boundary.rpc }) }));
import { POST } from "@/app/api/owner-access/route";

// Synthetic fixture only; the deployed access code stays in server configuration.
const shortCode = "246813579";
const request = (body: unknown) => new NextRequest("http://localhost/api/owner-access", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.stubEnv("ORVANTA_OWNER_ACCESS_KEY", shortCode);
  vi.stubEnv("API_SECRET_KEY", "");
  vi.stubEnv("ORVANTA_OWNER_COOKIE_SECRET", "synthetic-cookie-signing-secret-for-route-tests");
  boundary.rpc.mockReset();
  boundary.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("owner unlock with the configured access code", () => {
  it("accepts an exact nine-digit code and issues a verifiable HttpOnly cookie", async () => {
    const response = await POST(request({ code: shortCode }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, authenticated: true });
    const cookie = response.cookies.get(OWNER_ACCESS_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    await expect(verifyOwnerAccessToken(cookie?.value)).resolves.toBe(true);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("rejects an incorrect short code and counts the failed attempt", async () => {
    const response = await POST(request({ code: "135792468" }));
    expect(response.status).toBe(401);
    expect(response.cookies.get(OWNER_ACCESS_COOKIE)).toBeUndefined();
    expect(boundary.rpc).toHaveBeenCalledWith("orvanta_check_rate_limit", expect.any(Object));
  });

  it("rate limits incorrect short codes without locking out the correct code", async () => {
    boundary.rpc.mockResolvedValue({ data: { allowed: false, reset_at: new Date(Date.now() + 60_000).toISOString() }, error: null });
    const failed = await POST(request({ code: "135792468" }));
    expect(failed.status).toBe(429);
    expect(Number(failed.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(failed.cookies.get(OWNER_ACCESS_COOKIE)).toBeUndefined();
    const success = await POST(request({ code: shortCode }));
    expect(success.status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledTimes(1);
  });

  it("uses the updated server code and rejects the previous one", async () => {
    vi.stubEnv("ORVANTA_OWNER_ACCESS_KEY", "replacement-owner-code-for-test");
    expect((await POST(request({ code: shortCode }))).status).toBe(401);
    expect((await POST(request({ code: "replacement-owner-code-for-test" }))).status).toBe(200);
  });

  it.each([null, {}, { code: "" }, { code: "   " }, { code: 246813579 }, { code: [shortCode] }, { code: "x".repeat(129) }])(
    "rejects invalid input without issuing a cookie: %j", async (body) => {
      const response = await POST(request(body));
      expect(response.status).toBe(401);
      expect(response.cookies.get(OWNER_ACCESS_COOKIE)).toBeUndefined();
    },
  );

  it("fails closed when no owner code is configured", async () => {
    vi.stubEnv("ORVANTA_OWNER_ACCESS_KEY", "");
    const response = await POST(request({ code: shortCode }));
    expect(response.status).toBe(503);
    expect(response.cookies.get(OWNER_ACCESS_COOKIE)).toBeUndefined();
  });
});
