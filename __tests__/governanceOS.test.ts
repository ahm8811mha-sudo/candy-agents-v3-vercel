import { describe, it, expect, beforeEach } from "vitest";
import { evaluateGovernedAction } from "../lib/governanceOS";
import { listApprovals, _clearApprovals } from "../lib/approvals";
import { listAudit, _clearAudit } from "../lib/company/audit";
import { requiredTier } from "../lib/company/governance";

describe("governanceOS facade (unified decision center)", () => {
  beforeEach(() => {
    _clearApprovals();
    _clearAudit();
  });

  it("T0 low-risk actions execute immediately but are still audited", async () => {
    const result = await evaluateGovernedAction({
      title: "Small internal report",
      entityType: "reports",
      entityId: "rep-1",
      amount: 1_200,
      riskLevel: "LOW",
      actorRole: "CFO",
    });

    expect(result.allowedToExecute).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.approval).toBeNull();
    expect(result.policy.tier).toBe("T0");
    // Audit lands in the unified append-only trail.
    expect(listAudit().some((entry) => entry.action.includes("AUTO_APPROVED"))).toBe(true);
  });

  it("amounts above T0 land as pending items in the unified approval store", async () => {
    const result = await evaluateGovernedAction({
      title: "Close accounting period 2026-07",
      entityType: "accounting_period_closes",
      entityId: "2026-07",
      amount: 40_000,
      riskLevel: "LOW",
      actorRole: "CFO",
    });

    expect(result.allowedToExecute).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.approval).not.toBeNull();
    // The SAME store the /inbox decision center reads from.
    const pending = listApprovals("PENDING");
    expect(pending.some((item) => item.id === result.approval!.id)).toBe(true);
    expect(pending[0].metadata?.source).toBe("governanceOS");
  });

  it("HIGH risk escalates even below the T0 ceiling", async () => {
    const result = await evaluateGovernedAction({
      title: "Risky tiny action",
      entityType: "ops",
      entityId: "ops-9",
      amount: 500,
      riskLevel: "HIGH",
      actorRole: "COO",
    });

    expect(result.allowedToExecute).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(listApprovals("PENDING")).toHaveLength(1);
  });

  it("uses the authoritative tier matrix (no parallel 1,500 SAR rulebook)", async () => {
    // 3,000 SAR was PENDING under the legacy approval_policies table but is
    // T0 self-execution under the company authority matrix.
    expect(requiredTier(3_000).tier).toBe("T0");
    const result = await evaluateGovernedAction({
      title: "Mid-small spend",
      amount: 3_000,
      riskLevel: "LOW",
    });
    expect(result.allowedToExecute).toBe(true);
  });

  it("repeated evaluation of the same entity does not duplicate pending items", async () => {
    const first = await evaluateGovernedAction({
      title: "Radar pilot",
      entityType: "opportunity_radar_runs",
      entityId: "run-1",
      amount: 30_000,
    });
    const second = await evaluateGovernedAction({
      title: "Radar pilot",
      entityType: "opportunity_radar_runs",
      entityId: "run-1",
      amount: 30_000,
    });

    expect(first.approval!.id).toBe(second.approval!.id);
    expect(listApprovals("PENDING")).toHaveLength(1);
  });
});
