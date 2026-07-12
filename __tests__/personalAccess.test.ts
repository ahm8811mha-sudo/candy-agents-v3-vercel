import { afterEach, describe, expect, it } from "vitest";
import {
  issueOwnerAccessToken,
  verifyOwnerAccessToken,
} from "@/lib/security/personalAccess";

const originalSecret = process.env.ORVANTA_OWNER_COOKIE_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.ORVANTA_OWNER_COOKIE_SECRET;
  else process.env.ORVANTA_OWNER_COOKIE_SECRET = originalSecret;
});

describe("personal owner access", () => {
  it("accepts a valid signed device token", async () => {
    process.env.ORVANTA_OWNER_COOKIE_SECRET = "test-owner-cookie-secret-with-at-least-32-characters";
    const now = Date.UTC(2026, 6, 13);
    const token = await issueOwnerAccessToken(now);
    await expect(verifyOwnerAccessToken(token, now + 1_000)).resolves.toBe(true);
  });

  it("rejects tampered tokens", async () => {
    process.env.ORVANTA_OWNER_COOKIE_SECRET = "test-owner-cookie-secret-with-at-least-32-characters";
    const now = Date.UTC(2026, 6, 13);
    const token = await issueOwnerAccessToken(now);
    const tampered = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
    await expect(verifyOwnerAccessToken(tampered, now + 1_000)).resolves.toBe(false);
  });

  it("rejects expired tokens", async () => {
    process.env.ORVANTA_OWNER_COOKIE_SECRET = "test-owner-cookie-secret-with-at-least-32-characters";
    const now = Date.UTC(2026, 6, 13);
    const token = await issueOwnerAccessToken(now);
    const afterOneYear = now + 366 * 24 * 60 * 60 * 1000;
    await expect(verifyOwnerAccessToken(token, afterOneYear)).resolves.toBe(false);
  });

  it("fails closed when no signing secret is configured", async () => {
    delete process.env.ORVANTA_OWNER_COOKIE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(verifyOwnerAccessToken("invalid")).resolves.toBe(false);
  });
});
