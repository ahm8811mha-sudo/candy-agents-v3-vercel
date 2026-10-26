import { describe, it, expect } from "vitest";
import { COMPANY_AGENTS, getAgent, getDirectReports } from "../lib/company/agents";
import {
  requiredTier,
  canSelfApprove,
  requiresOwner,
  requiresFeasibility,
  AUTHORITY_MATRIX,
} from "../lib/company/governance";

describe("agent registry", () => {
  it("has unique ids", () => {
    const ids = COMPANY_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every reportsTo points to an existing agent", () => {
    for (const a of COMPANY_AGENTS) {
      if (a.reportsTo) expect(getAgent(a.reportsTo)).toBeDefined();
    }
  });

  it("only the owner has no manager", () => {
    const roots = COMPANY_AGENTS.filter((a) => a.reportsTo === null);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("owner");
  });

  it("all non-owner agents report up to sultan", () => {
    const reports = getDirectReports("sultan");
    expect(reports.length).toBeGreaterThanOrEqual(9);
  });
});

describe("authority matrix", () => {
  it("tiers are ordered and cover all amounts", () => {
    const maxes = AUTHORITY_MATRIX.map((r) => r.maxSAR);
    for (let i = 1; i < maxes.length; i++) expect(maxes[i]).toBeGreaterThan(maxes[i - 1]);
    expect(maxes[maxes.length - 1]).toBe(Number.POSITIVE_INFINITY);
  });

  it("maps zero to operations and every positive amount to the Chairman", () => {
    expect(requiredTier(0).tier).toBe("T0");
    expect(requiredTier(1).tier).toBe("T2");
    expect(requiredTier(100_000).tier).toBe("T2");
    expect(requiredTier(100_001).tier).toBe("T3");
  });

  it("invalid amounts escalate to the top tier", () => {
    expect(requiredTier(-500).tier).toBe("T3");
    expect(requiredTier(NaN).tier).toBe("T3");
  });

  it("owner approval is required for any positive amount", () => {
    expect(requiresOwner(0)).toBe(false);
    expect(requiresOwner(1)).toBe(true);
    expect(requiresOwner(500_000)).toBe(true);
  });

  it("feasibility study required only at T3", () => {
    expect(requiresFeasibility(100_000)).toBe(false);
    expect(requiresFeasibility(100_001)).toBe(true);
  });
});

describe("self-approval", () => {
  it("no employee may approve a positive amount", () => {
    for (const agent of ["sultan", "abdulrahman", "noura", "fahad", "sara", "khalid", "majed", "rased", "ameen", "hares", "diwan"]) {
      expect(canSelfApprove(agent, 1)).toBe(false);
      expect(canSelfApprove(agent, 20_000)).toBe(false);
    }
  });

  it("the Chairman may approve any positive amount; an unknown id may not", () => {
    expect(canSelfApprove("owner", 1_000_000)).toBe(true);
    expect(canSelfApprove("ghost", 10)).toBe(false);
  });

  it("every employee spend ceiling is zero", () => {
    for (const agent of COMPANY_AGENTS) {
      if (agent.id === "owner") continue;
      expect(agent.authorityLimitSAR).toBe(0);
    }
    expect(getAgent("owner")?.title).toBe("رئيس مجلس الإدارة");
  });
});
