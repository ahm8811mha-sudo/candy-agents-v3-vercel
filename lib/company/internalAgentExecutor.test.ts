import { describe, expect, it } from "vitest";
import { shouldRecoverAgentAction } from "./internalAgentExecutor";

describe("internal agent recovery", () => {
  const now = Date.parse("2026-07-16T12:00:00.000Z");

  it("recovers queued, failed, and stale running work", () => {
    expect(shouldRecoverAgentAction({ status: "QUEUED", attempts: 0, last_attempt_at: null }, now)).toBe(true);
    expect(shouldRecoverAgentAction({ status: "FAILED", attempts: 1, last_attempt_at: null }, now)).toBe(true);
    expect(shouldRecoverAgentAction({ status: "RUNNING", attempts: 1, last_attempt_at: "2026-07-16T11:50:00.000Z" }, now)).toBe(true);
  });

  it("does not duplicate fresh or exhausted work", () => {
    expect(shouldRecoverAgentAction({ status: "RUNNING", attempts: 1, last_attempt_at: "2026-07-16T11:59:00.000Z" }, now)).toBe(false);
    expect(shouldRecoverAgentAction({ status: "FAILED", attempts: 3, last_attempt_at: null }, now)).toBe(false);
    expect(shouldRecoverAgentAction({ status: "DONE", attempts: 1, last_attempt_at: null }, now)).toBe(false);
  });
});
