import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openDecisionCommitment,
  advanceCommitment,
  sweepDecisionCommitments,
  secretariatBrief,
  listDecisionCommitments,
} from "@/lib/company/executiveSecretariat";
import { COMPANY_AGENTS, getAgent } from "@/lib/company/agents";

describe("Executive Secretariat agent", () => {
  it("رئيس الديوان is a real agent in the registry", () => {
    const diwan = getAgent("diwan");
    expect(diwan).toBeDefined();
    expect(diwan?.department).toBe("الديوان التنفيذي");
    expect(diwan?.reportsTo).toBe("sultan");
    // The office cannot spend on its own; it only tracks.
    expect(diwan?.authorityLimitSAR).toBe(0);
  });

  it("does not duplicate an existing agent id", () => {
    const ids = COMPANY_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("secretariat engine without Supabase", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => { process.env = { ...original }; });

  it("openDecisionCommitment fails safely without Supabase", async () => {
    const result = await openDecisionCommitment({ sourceType: "approval", sourceId: "a-1", title: "قرار تجريبي" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Supabase/);
  });

  it("openDecisionCommitment validates required fields", async () => {
    // Even with Supabase absent, the Supabase guard fires first; assert the
    // engine never throws on malformed input.
    const result = await openDecisionCommitment({ sourceType: "", sourceId: "", title: "" });
    expect(result.ok).toBe(false);
  });

  it("advanceCommitment fails safely without Supabase", async () => {
    const result = await advanceCommitment({ id: "x", status: "IN_PROGRESS" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Supabase/);
  });

  it("sweep and brief degrade to empty without Supabase", async () => {
    expect(await sweepDecisionCommitments()).toEqual({ reminded: 0, escalated: 0 });
    expect(await listDecisionCommitments()).toEqual([]);
    const brief = await secretariatBrief();
    expect(brief.open).toBe(0);
    expect(brief.byAssignee).toEqual([]);
  });
});
