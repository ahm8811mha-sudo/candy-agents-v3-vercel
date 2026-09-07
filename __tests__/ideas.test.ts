import { beforeEach, describe, expect, it } from "vitest";
import { submitIdea, listIdeas, ensureDailyIdea, addRecommendation, enrichIdea, syncIdeasWithApprovals, ideaStats, _clearIdeas } from "../lib/company/ideas";
import { assessIdea, opportunitiesFromRecords } from "../lib/company/ideaAssessment";
import { listApprovals, decideApproval, _clearApprovals } from "../lib/approvals";
import { completeStudy } from "./fixtures/idea-study";
const signals = opportunitiesFromRecords({ inventory: [{ id: "item-1", name: "صنف الاختبار", on_hand: 2, reorder_point: 10, unit_cost: 20 }], blockedTasks: [] });

describe("evidence-based ideas", () => {
  beforeEach(() => { _clearIdeas(); _clearApprovals(); });
  it("keeps an unsubstantiated idea under study without a fake ROI or confidence", () => {
    const idea = submitIdea({ title: "فكرة اختبار", hypothesis: "فرضية تحتاج دليلاً", budgetSAR: 10000, horizonDays: 30 });
    expect(idea.status).toBe("UNDER_STUDY");
    expect(idea.recommendations).toHaveLength(3);
    expect(idea.aggregate?.assessment?.projections).toBeNull();
    expect(idea.aggregate?.confidence).toBe(0);
    expect(listApprovals()).toHaveLength(0);
  });
  it("creates a governed approval only after complete inputs", () => {
    const idea = submitIdea({ title: "دراسة مكتملة", hypothesis: "اختبار فكرة تجارية", budgetSAR: 30000, horizonDays: 30, study: completeStudy });
    expect(idea.status).toBe("PENDING_APPROVAL"); expect(idea.tier).toBe("T2");
    const approval = listApprovals().find((a) => a.metadata?.ideaId === idea.id)!;
    expect(approval.amount).toBe(30000); expect(approval.type).toBe("IDEA");
  });
  it("retains the high-budget authority tier with all three department reviews", () => {
    const idea = submitIdea({ title: "توسع كبير", hypothesis: "اختبار التوسع المقترح", budgetSAR: 150000, horizonDays: 60, study: completeStudy });
    expect(idea.tier).toBe("T3");
    expect(idea.recommendations.map((r) => r.agentId)).toEqual(["abdulrahman", "noura", "fahad"]);
    expect(listApprovals()[0].metadata?.tier).toBe("T3");
  });
  it("never makes up a daily idea without operating records", () => {
    expect(ensureDailyIdea(new Date("2026-07-02"))).toBeNull();
    expect(ideaStats().total).toBe(0);
  });
  it("reuses the same source-backed idea within a day", () => {
    const now = new Date("2026-07-02T08:00:00Z");
    const a = ensureDailyIdea(now, signals)!; const b = ensureDailyIdea(now, signals)!;
    expect(a.id).toBe(b.id); expect(a.id).toBe("idea-daily-golden-star-2026-07-02");
    expect(a.source).toBe("TEAM"); expect(a.status).toBe("UNDER_STUDY");
    expect(a.aggregate?.assessment?.input.evidenceSource).toBe("inventory_items/item-1");
  });
  it("does not recycle the same business opportunity merely because the day changed", () => {
    ensureDailyIdea(new Date("2026-07-02"), signals);
    expect(ensureDailyIdea(new Date("2026-07-03"), signals)).toBeNull();
    expect(ideaStats().fromTeam).toBe(1);
  });
  it("incorporates additional departments into the verdict", () => {
    const idea = submitIdea({ title: "مشاركة الأقسام", hypothesis: "اختبار رأي فريق إضافي", budgetSAR: 5000, horizonDays: 14, study: completeStudy });
    addRecommendation(idea.id, "sara", "REJECT", "يوجد عائق تسويقي موثق.");
    const updated = addRecommendation(idea.id, "rased", "REJECT", "يوجد تعارض في مصدر البيانات.");
    expect(updated!.recommendations).toHaveLength(5);
    expect(updated!.aggregate?.verdict).toBe("REJECT");
  });
  it.each(["APPROVED", "REJECTED"] as const)("reflects the %s decision", (status) => {
    const idea = submitIdea({ title: "قرار الفكرة", hypothesis: "اختبار ربط القرار بالفكرة", budgetSAR: 50000, horizonDays: 30, study: completeStudy });
    decideApproval(idea.approvalId!, status, "المالك"); syncIdeasWithApprovals();
    expect(listIdeas()[0].status).toBe(status);
  });
  it("labels missing provider configuration without pretending a model ran", async () => {
    const idea = submitIdea({ title: "دراسة بلا نموذج", hypothesis: "اختبار عدم اختلاق تحليل", budgetSAR: 10000, horizonDays: 30 });
    const enriched = await enrichIdea(idea.id);
    expect(enriched?.studyMode).toBe("HEURISTIC"); expect(enriched?.aggregate?.narrative).toBeUndefined();
    expect(enriched?.aggregate?.analysisWarning).toContain("لم يُضبط");
  });
  it("calculates transparent projections and a downside scenario", () => {
    const assessment = assessIdea(5000, completeStudy);
    expect(assessment.coverage).toBe(100); expect(assessment.readyForDecision).toBe(true);
    expect(assessment.projections).toMatchObject({ revenueSAR: 3000, totalCostSAR: 1200, profitSAR: 1800, breakEvenUnits: 10, downsideProfitSAR: 1200 });
  });
  it("rejects negative contribution regardless of complete evidence", () => {
    expect(assessIdea(5000, { ...completeStudy, unitPriceSAR: 5 }).verdict).toBe("REJECT");
  });
  it("does not demand invented sales for a zero-cost operational improvement", () => {
    const study = { ...completeStudy, kind: "OPERATIONAL" as const, expectedOutcome: "تقليل وقت تجهيز الطلب دون شراء أدوات" };
    const assessment = assessIdea(0, study);
    expect(assessment.readyForDecision).toBe(true); expect(assessment.projections).toBeNull();
    const idea = submitIdea({ title: "تحسين إجراء", hypothesis: "نختبر إجراءً داخلياً دون إنفاق", budgetSAR: 0, horizonDays: 7, study });
    expect(idea.approvalId).toBeDefined();
  });
});
