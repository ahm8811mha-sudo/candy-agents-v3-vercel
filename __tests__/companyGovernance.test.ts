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

  it("maps amounts to the correct tier (boundaries inclusive)", () => {
    expect(requiredTier(1_000).tier).toBe("T0");
    expect(requiredTier(5_000).tier).toBe("T0");
    expect(requiredTier(5_001).tier).toBe("T1");
    expect(requiredTier(25_000).tier).toBe("T1");
    expect(requiredTier(25_001).tier).toBe("T2");
    expect(requiredTier(100_000).tier).toBe("T2");
    expect(requiredTier(100_001).tier).toBe("T3");
  });

  it("invalid amounts escalate to the top tier", () => {
    expect(requiredTier(0).tier).toBe("T3");
    expect(requiredTier(-500).tier).toBe("T3");
    expect(requiredTier(NaN).tier).toBe("T3");
  });

  it("owner approval required from T2 up", () => {
    expect(requiresOwner(25_000)).toBe(false);
    expect(requiresOwner(25_001)).toBe(true);
    expect(requiresOwner(500_000)).toBe(true);
  });

  it("feasibility study required only at T3", () => {
    expect(requiresFeasibility(100_000)).toBe(false);
    expect(requiresFeasibility(100_001)).toBe(true);
  });
});

describe("self-approval (T0 gate)", () => {
  it("department head may self-approve within their limit", () => {
    expect(canSelfApprove("abdulrahman", 4_000)).toBe(true);
    expect(canSelfApprove("abdulrahman", 5_000)).toBe(true);
  });

  it("department head may NOT exceed T0", () => {
    expect(canSelfApprove("abdulrahman", 6_000)).toBe(false);
  });

  it("functional agents cannot spend alone", () => {
    expect(canSelfApprove("rased", 100)).toBe(false);
    expect(canSelfApprove("ameen", 1)).toBe(false);
  });

  it("sultan covers T0 and T1 but not T2", () => {
    expect(canSelfApprove("sultan", 20_000)).toBe(true);
    expect(canSelfApprove("sultan", 30_000)).toBe(false);
  });

  it("owner approves anything; unknown agent approves nothing", () => {
    expect(canSelfApprove("owner", 1_000_000)).toBe(true);
    expect(canSelfApprove("ghost", 10)).toBe(false);
  });
});
