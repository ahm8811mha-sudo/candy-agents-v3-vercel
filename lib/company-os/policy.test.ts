import { describe, expect, it } from "vitest";
import { evaluateCompanyPolicy } from "./policy";
import type { AuthUser } from "../auth";

const actor: AuthUser = {
  id: "user-1",
  email: "ceo@example.com",
  role: "CEO",
  name: "CEO",
  tenantId: "tenant-a",
  authMethod: "SUPABASE",
};

describe("company policy engine", () => {
  it("rejects cross-tenant execution", () => {
    const decision = evaluateCompanyPolicy({
      tenantId: "tenant-b",
      actor,
      operation: "EXECUTE_EXTERNAL_ACTION",
      evidenceCount: 1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("TENANT_MISMATCH");
  });

  it("prevents a proposer from solely approving a material decision", () => {
    const decision = evaluateCompanyPolicy({
      tenantId: "tenant-a",
      actor,
      operation: "APPROVE_DECISION",
      proposerId: actor.id,
      evidenceCount: 2,
      customerFacing: true,
      approvedRoles: ["CEO"],
    });
    expect(decision.riskLevel).toBe("MEDIUM");
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("SEPARATION_OF_DUTIES_REQUIRED");
  });

  it("requires the full high-risk approval route", () => {
    const decision = evaluateCompanyPolicy({
      tenantId: "tenant-a",
      actor,
      operation: "EXECUTE_EXTERNAL_ACTION",
      evidenceCount: 3,
      sensitiveData: true,
      approvedRoles: ["CEO", "CFO"],
    });
    expect(decision.riskLevel).toBe("HIGH");
    expect(decision.allowed).toBe(false);
    expect(decision.missingApprovals).toContain("CRO");
  });

  it("allows a low-risk reversible action in the same tenant", () => {
    const decision = evaluateCompanyPolicy({
      tenantId: "tenant-a",
      actor,
      operation: "EXECUTE_EXTERNAL_ACTION",
      evidenceCount: 1,
      commitmentSAR: 100,
    });
    expect(decision.riskLevel).toBe("LOW");
    expect(decision.allowed).toBe(true);
  });
});
