import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getProductionReadiness } from "@/lib/company/productionReadiness";

/**
 * Regression guard for the owner-lockout defect.
 *
 * The login form once carried minLength={12}. That rule protected nothing —
 * an attacker posts straight to the API and never renders the form; brute
 * force is stopped by the server-side rate limit. Its only real effect was to
 * lock the legitimate owner out whenever the configured code was shorter than
 * the rule. Strength belongs on the configured code, checked by the readiness
 * gate, which is what these tests pin down.
 */

function readiness() {
  return getProductionReadiness();
}

function gate(id: string) {
  return readiness().checks.find((c) => c.id === id);
}

describe("owner access code strength gate", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.ORVANTA_PERSONAL_MODE = "true";
    delete process.env.ORVANTA_OWNER_ACCESS_KEY;
    delete process.env.API_SECRET_KEY;
  });
  afterEach(() => { process.env = { ...original }; });

  it("warns when the configured owner code is too short", () => {
    process.env.ORVANTA_OWNER_ACCESS_KEY = "short123";
    const check = gate("owner-code-strength");
    expect(check).toBeDefined();
    expect(check?.severity).toBe("WARN");
    expect(check?.detail).toMatch(/8 characters/);
  });

  it("passes when the configured owner code is strong", () => {
    process.env.ORVANTA_OWNER_ACCESS_KEY = "a-properly-long-owner-code-2026";
    expect(gate("owner-code-strength")?.severity).toBe("PASS");
  });

  it("never blocks production readiness on its own (warning, not failure)", () => {
    process.env.ORVANTA_OWNER_ACCESS_KEY = "short123";
    const check = gate("owner-code-strength");
    // A weak code must be surfaced, but it must not hard-fail the release
    // gate — the owner still needs to get in and fix it.
    expect(check?.requiredForProduction).toBe(false);
  });
});

describe("login form must not enforce a length rule", () => {
  it("has no minLength attribute on the owner code input", () => {
    const source = readFileSync("app/login/page.tsx", "utf8");
    // Match the JSX attribute, not the word — the file explains in a comment
    // why the rule was removed, and that explanation must stay readable.
    expect(source).not.toMatch(/minLength\s*=/);
  });
});
