import { describe, expect, it } from "vitest";
import {
  defaultOwnerAbsencePolicy,
  effectiveOwnerAbsenceStatus,
  evaluateOwnerAbsenceAuthority,
  hasCompletionEvidence,
} from "./ownerAbsencePolicy";

function activePolicy() {
  return {
    ...defaultOwnerAbsencePolicy("golden-star"),
    status: "ACTIVE" as const,
    effectiveStatus: "ACTIVE" as const,
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("owner absence operating authority", () => {
  it("activates only inside the owner-approved time window", () => {
    const policy = { ...activePolicy(), status: "SCHEDULED" as const };
    expect(effectiveOwnerAbsenceStatus(policy, Date.parse("2026-06-30T23:59:00Z"))).toBe("SCHEDULED");
    expect(effectiveOwnerAbsenceStatus(policy, Date.parse("2026-07-15T12:00:00Z"))).toBe("ACTIVE");
    expect(effectiveOwnerAbsenceStatus(policy, Date.parse("2026-08-01T00:00:00Z"))).toBe("EXPIRED");
  });

  it("lets internal agents complete routine work without owner intervention", () => {
    const decision = evaluateOwnerAbsenceAuthority(activePolicy(), {
      actionType: "AGENT_DELIVERABLE",
      executionMode: "INTERNAL",
      provider: "orvanta_agents",
      amountSAR: 0,
      riskLevel: "LOW",
      requiresApproval: false,
    }, Date.parse("2026-07-15T12:00:00Z"));
    expect(decision).toMatchObject({ allowed: true, outcome: "AUTONOMOUS_EXECUTION" });
  });

  it("keeps strategy, high risk, and material commitments with the owner", () => {
    expect(evaluateOwnerAbsenceAuthority(activePolicy(), {
      actionType: "STRATEGY_CHANGE",
      amountSAR: 100,
      riskLevel: "LOW",
    }, Date.parse("2026-07-15T12:00:00Z")).allowed).toBe(false);
    expect(evaluateOwnerAbsenceAuthority(activePolicy(), {
      actionType: "BUDGET_GATE",
      executionMode: "INTERNAL",
      provider: "internal",
      amountSAR: 100,
      riskLevel: "LOW",
    }, Date.parse("2026-07-15T12:00:00Z")).allowed).toBe(false);
    expect(evaluateOwnerAbsenceAuthority(activePolicy(), {
      actionType: "AGENT_DELIVERABLE",
      amountSAR: 100,
      riskLevel: "HIGH",
    }, Date.parse("2026-07-15T12:00:00Z")).allowed).toBe(false);
    expect(evaluateOwnerAbsenceAuthority(activePolicy(), {
      actionType: "AGENT_DELIVERABLE",
      amountSAR: 25_001,
      riskLevel: "LOW",
    }, Date.parse("2026-07-15T12:00:00Z")).allowed).toBe(false);
  });

  it("blocks external side effects by default and requires evidence to close work", () => {
    const decision = evaluateOwnerAbsenceAuthority(activePolicy(), {
      actionType: "CREATE_GMAIL_DRAFT",
      executionMode: "READY_FOR_INTEGRATION",
      provider: "google_workspace",
      amountSAR: 0,
      riskLevel: "LOW",
    }, Date.parse("2026-07-15T12:00:00Z"));
    expect(decision).toMatchObject({ allowed: false, outcome: "DEFER_TO_OWNER" });
    expect(hasCompletionEvidence(undefined)).toBe(false);
    expect(hasCompletionEvidence({ deliverable: { summary: "done" } })).toBe(true);
  });
});
