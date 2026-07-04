import { describe, it, expect, beforeEach } from "vitest";
import {
  submitIdea,
  listIdeas,
  ensureDailyIdea,
  addRecommendation,
  enrichIdea,
  syncIdeasWithApprovals,
  ideaStats,
  _clearIdeas,
} from "../lib/company/ideas";
import { listApprovals, decideApproval, _clearApprovals } from "../lib/approvals";

describe("ideas pipeline", () => {
  beforeEach(() => {
    _clearIdeas();
    _clearApprovals();
  });

  it("an owner idea is studied by the three heads and sultan aggregates", () => {
    const idea = submitIdea({ title: "فكرة اختبار", hypothesis: "فرضية", budgetSAR: 10_000, horizonDays: 30 });
    expect(idea.source).toBe("OWNER");
    expect(idea.recommendations).toHaveLength(3);
    const ids = idea.recommendations.map((r) => r.agentId);
    expect(ids).toEqual(expect.arrayContaining(["abdulrahman", "noura", "fahad"]));
    expect(idea.aggregate).toBeDefined();
    expect(idea.aggregate!.confidence).toBeGreaterThan(0);
  });

  it("study creates an approval item gated by the authority matrix", () => {
    const idea = submitIdea({ title: "فكرة معتمدة", hypothesis: "ف", budgetSAR: 30_000, horizonDays: 30 });
    expect(idea.status).toBe("PENDING_APPROVAL");
    expect(idea.tier).toBe("T2"); // 30k → owner tier
    const approval = listApprovals().find((a) => a.metadata?.ideaId === idea.id);
    expect(approval).toBeDefined();
    expect(approval!.amount).toBe(30_000);
    expect(approval!.type).toBe("IDEA");
  });

  it("T3 ideas carry the tri-feasibility marker", () => {
    const idea = submitIdea({ title: "توسع كبير", hypothesis: "ف", budgetSAR: 150_000, horizonDays: 60 });
    expect(idea.tier).toBe("T3");
    const approval = listApprovals().find((a) => a.metadata?.ideaId === idea.id);
    expect(approval!.detail).toContain("الجدوى الثلاثية");
  });

  it("the daily team idea is idempotent per calendar day and comes from راصد", () => {
    const now = new Date("2026-07-02T08:00:00Z");
    const a = ensureDailyIdea(now);
    const b = ensureDailyIdea(now);
    expect(a.id).toBe(b.id);
    expect(a.source).toBe("TEAM");
    expect(a.proposedByName).toContain("راصد");
    expect(a.status).toBe("PENDING_APPROVAL");
    expect(ideaStats().fromTeam).toBe(1);
  });

  it("a new day produces a new team idea", () => {
    const d1 = ensureDailyIdea(new Date("2026-07-02T08:00:00Z"));
    const d2 = ensureDailyIdea(new Date("2026-07-03T08:00:00Z"));
    expect(d1.id).not.toBe(d2.id);
    expect(ideaStats().fromTeam).toBe(2);
  });

  it("the daily team idea uses a deterministic day-keyed id (no cross-restart dupes)", () => {
    const now = new Date("2026-07-04T08:00:00Z");
    const a = ensureDailyIdea(now);
    expect(a.id).toBe("idea-daily-2026-07-04");
    // Simulate a second cold instance re-submitting the same deterministic id
    // (e.g. before the first write hydrated) — it must collapse to one idea.
    const b = submitIdea({
      title: a.title,
      hypothesis: a.hypothesis,
      budgetSAR: a.budgetSAR,
      horizonDays: a.horizonDays,
      source: "TEAM",
      proposedBy: "rased",
      id: "idea-daily-2026-07-04",
      dayKey: "2026-07-04",
    });
    expect(b.id).toBe(a.id);
    expect(ideaStats().fromTeam).toBe(1);
  });

  it("other agents can add recommendations (team participation)", () => {
    const idea = submitIdea({ title: "ف", hypothesis: "ف", budgetSAR: 5_000, horizonDays: 14 });
    const updated = addRecommendation(idea.id, "sara", "APPROVE", "قاعدة عملائنا مناسبة لهذه الفكرة");
    expect(updated!.recommendations).toHaveLength(4);
    expect(updated!.recommendations[3].agentName).toBe("سارة");
  });

  it("inbox decisions flow back to the idea (approve)", () => {
    const idea = submitIdea({ title: "ف", hypothesis: "ف", budgetSAR: 50_000, horizonDays: 30 });
    const approval = listApprovals().find((a) => a.metadata?.ideaId === idea.id)!;
    decideApproval(approval.id, "APPROVED", "المالك");
    syncIdeasWithApprovals();
    expect(listIdeas().find((i) => i.id === idea.id)!.status).toBe("APPROVED");
  });

  it("enrichIdea degrades to heuristic-only without an OpenAI key", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const idea = submitIdea({ title: "بلا مفتاح", hypothesis: "ف", budgetSAR: 10_000, horizonDays: 30 });
    const enriched = await enrichIdea(idea.id);
    expect(enriched!.studyMode).toBe("HEURISTIC");
    expect(enriched!.aggregate?.narrative).toBeUndefined();
    if (prev) process.env.OPENAI_API_KEY = prev;
  });

  it("inbox rejection flows back too", () => {
    const idea = submitIdea({ title: "ف2", hypothesis: "ف", budgetSAR: 50_000, horizonDays: 30 });
    const approval = listApprovals().find((a) => a.metadata?.ideaId === idea.id)!;
    decideApproval(approval.id, "REJECTED", "المالك");
    expect(listIdeas().find((i) => i.id === idea.id)!.status).toBe("REJECTED");
  });
});
