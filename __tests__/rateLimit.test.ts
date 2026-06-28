import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../lib/rateLimit";

describe("checkRateLimit", () => {
  it("allows requests within limit", () => {
    const id = `test-${Date.now()}-1`;
    const result = checkRateLimit(id, { windowMs: 60_000, maxRequests: 5 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests exceeding limit", () => {
    const id = `test-${Date.now()}-2`;
    const config = { windowMs: 60_000, maxRequests: 3 };

    checkRateLimit(id, config);
    checkRateLimit(id, config);
    checkRateLimit(id, config);
    const result = checkRateLimit(id, config);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks remaining correctly", () => {
    const id = `test-${Date.now()}-3`;
    const config = { windowMs: 60_000, maxRequests: 5 };

    const r1 = checkRateLimit(id, config);
    const r2 = checkRateLimit(id, config);
    const r3 = checkRateLimit(id, config);

    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(3);
    expect(r3.remaining).toBe(2);
  });

  it("isolates different identifiers", () => {
    const id1 = `test-${Date.now()}-4a`;
    const id2 = `test-${Date.now()}-4b`;
    const config = { windowMs: 60_000, maxRequests: 2 };

    checkRateLimit(id1, config);
    checkRateLimit(id1, config);
    const blocked = checkRateLimit(id1, config);
    const allowed = checkRateLimit(id2, config);

    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });
});
