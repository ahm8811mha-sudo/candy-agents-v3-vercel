import { describe, expect, it } from "vitest";
import { submitIdea } from "./ideas";
import { executeApprovedIdea } from "./ideaExecution";

function uniqueTitle() {
  return `اختبار تحويل فكرة معتمدة ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

describe("executeApprovedIdea", () => {
  it("returns a clear failure when approval metadata has no ideaId", async () => {
    const result = await executeApprovedIdea({}, "اختبار");

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ideaId");
    expect(result.counts).toEqual({ tasks: 0, kpis: 0, actions: 0 });
  });

  it("turns an approved idea into an execution blueprint even without Supabase", async () => {
    const idea = submitIdea({
      title: uniqueTitle(),
      hypothesis: "اختبار قابلية تحويل الفكرة المعتمدة إلى خطة تنفيذ.",
      budgetSAR: 12000,
      horizonDays: 30,
      source: "OWNER",
      proposedBy: "owner",
    });

    const result = await executeApprovedIdea({ ideaId: idea.id }, "اختبار");

    expect(result.ok).toBe(true);
    expect(result.ideaId).toBe(idea.id);
    expect(result.counts.tasks).toBeGreaterThan(0);
    expect(result.counts.kpis).toBeGreaterThan(0);
    expect(result.counts.actions).toBeGreaterThan(0);
  });
});
