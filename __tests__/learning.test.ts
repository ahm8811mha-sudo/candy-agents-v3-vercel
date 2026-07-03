import { describe, it, expect, beforeEach } from "vitest";
import { getLearningSnapshot } from "../lib/company/learning";
import { submitIdea, _clearIdeas } from "../lib/company/ideas";
import { listApprovals, decideApproval, _clearApprovals } from "../lib/approvals";

function decideLatestIdea(decision: "APPROVED" | "REJECTED") {
  const approval = listApprovals().find((a) => a.type === "IDEA" && a.status === "PENDING");
  if (approval) decideApproval(approval.id, decision, "المالك");
}

describe("self-improvement loop", () => {
  beforeEach(() => {
    _clearIdeas();
    _clearApprovals();
  });

  it("starts neutral with no completed decisions", () => {
    submitIdea({ title: "ف", hypothesis: "ف", budgetSAR: 10_000, horizonDays: 30 });
    const snap = getLearningSnapshot();
    expect(snap.decisionsAnalyzed).toBe(0);
    expect(snap.confidenceThreshold).toBe(0.6);
    expect(snap.recommendation).toContain("لا قرارات مكتملة");
  });

  it("counts approvals and rejections from the owner's outcomes", () => {
    submitIdea({ title: "أ", hypothesis: "ف", budgetSAR: 10_000, horizonDays: 30 });
    decideLatestIdea("APPROVED");
    submitIdea({ title: "ب", hypothesis: "ف", budgetSAR: 12_000, horizonDays: 30 });
    decideLatestIdea("REJECTED");
    const snap = getLearningSnapshot();
    expect(snap.decisionsAnalyzed).toBe(2);
    expect(snap.approved).toBe(1);
    expect(snap.rejected).toBe(1);
    expect(snap.approvalRate).toBeCloseTo(0.5, 5);
  });

  it("raises the confidence bar when the owner rejects most ideas", () => {
    for (let i = 0; i < 4; i++) {
      submitIdea({ title: `ر${i}`, hypothesis: "ف", budgetSAR: 10_000 + i, horizonDays: 30 });
      decideLatestIdea("REJECTED");
    }
    const snap = getLearningSnapshot();
    expect(snap.approvalRate).toBeLessThan(0.4);
    expect(snap.confidenceThreshold).toBeGreaterThan(0.6);
    expect(snap.recommendation).toContain("رُفع");
  });

  it("relaxes the bar when the owner approves most ideas", () => {
    for (let i = 0; i < 4; i++) {
      submitIdea({ title: `ق${i}`, hypothesis: "ف", budgetSAR: 10_000 + i, horizonDays: 30 });
      decideLatestIdea("APPROVED");
    }
    const snap = getLearningSnapshot();
    expect(snap.approvalRate).toBeGreaterThan(0.75);
    expect(snap.confidenceThreshold).toBeLessThan(0.6);
  });

  it("keeps the threshold within safe bounds", () => {
    for (let i = 0; i < 6; i++) {
      submitIdea({ title: `س${i}`, hypothesis: "ف", budgetSAR: 10_000 + i, horizonDays: 30 });
      decideLatestIdea("REJECTED");
    }
    const snap = getLearningSnapshot();
    expect(snap.confidenceThreshold).toBeLessThanOrEqual(0.8);
    expect(snap.confidenceThreshold).toBeGreaterThanOrEqual(0.5);
  });

  it("measures per-agent alignment with owner outcomes", () => {
    submitIdea({ title: "محاذاة", hypothesis: "ف", budgetSAR: 10_000, horizonDays: 30 });
    decideLatestIdea("APPROVED");
    const snap = getLearningSnapshot();
    expect(snap.agentAccuracy.length).toBeGreaterThan(0);
    for (const a of snap.agentAccuracy) {
      expect(a.accuracy).toBeGreaterThanOrEqual(0);
      expect(a.accuracy).toBeLessThanOrEqual(1);
      expect(a.aligned).toBeLessThanOrEqual(a.studied);
    }
  });
});
