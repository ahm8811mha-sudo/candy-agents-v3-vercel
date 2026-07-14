import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { recordAudit, listAudit, auditStats, _clearAudit } from "../lib/company/audit";
import { canApproveTier, canSignOff, minRoleForTier } from "../lib/company/access";
import { approvalTierForDecision, effectiveTier } from "../lib/company/governance";

describe("audit trail (F1)", () => {
  beforeEach(() => _clearAudit());

  it("appends entries newest-first with who/what/when", () => {
    recordAudit({ actor: "المالك", action: "APPROVE", entityType: "trade", entityId: "t1", detail: "اعتماد" });
    recordAudit({ actor: "سلطان", action: "REJECT", entityType: "idea", entityId: "i1", detail: "رفض" });
    const list = listAudit();
    expect(list).toHaveLength(2);
    expect(list[0].actor).toBe("سلطان");
    expect(list[0].createdAt).toBeTruthy();
  });

  it("filters by action and entity type", () => {
    recordAudit({ actor: "a", action: "APPROVE", entityType: "trade", entityId: "1", detail: "" });
    recordAudit({ actor: "a", action: "REJECT", entityType: "idea", entityId: "2", detail: "" });
    expect(listAudit({ action: "APPROVE" })).toHaveLength(1);
    expect(listAudit({ entityType: "idea" })).toHaveLength(1);
    expect(auditStats().total).toBe(2);
  });
});

describe("authority enforcement (F2)", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.AUTH_ENABLED;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("maps tiers to minimum roles", () => {
    expect(minRoleForTier("T0")).toBe("MANAGER");
    expect(minRoleForTier("T1")).toBe("CEO");
    expect(minRoleForTier("T2")).toBe("ADMIN");
    expect(minRoleForTier("T3")).toBe("ADMIN");
  });

  it("persists owner escalation when a high-risk amount alone would be T0", () => {
    expect(effectiveTier(500, "LOW").tier).toBe("T0");
    const tier = effectiveTier(500, "HIGH").tier;
    expect(tier).toBe("T2");
    expect(approvalTierForDecision(500, { governanceTier: tier })).toBe("T2");
  });

  it("role check respects the hierarchy", () => {
    expect(canApproveTier("ADMIN", "T2")).toBe(true);
    expect(canApproveTier("CEO", "T2")).toBe(false);
    expect(canApproveTier("CEO", "T1")).toBe(true);
    expect(canApproveTier("VIEWER", "T0")).toBe(false);
    expect(canApproveTier("MANAGER", "T0")).toBe(true);
  });

  it("single-owner mode (auth off) allows any sign-off", () => {
    const d = canSignOff(null, "T3");
    expect(d.allowed).toBe(true);
  });

  it("with auth on, a low role cannot sign off a high tier", () => {
    process.env.AUTH_ENABLED = "true";
    expect(canSignOff("VIEWER", "T2").allowed).toBe(false);
    expect(canSignOff("CEO", "T2").allowed).toBe(false);
    expect(canSignOff("ADMIN", "T2").allowed).toBe(true);
    expect(canSignOff(null, "T1").allowed).toBe(false);
  });
});
