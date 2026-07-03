import { describe, it, expect, beforeEach } from "vitest";
import { composeDigest, dispatchDigest } from "../lib/company/digest";
import { submitIdea, _clearIdeas } from "../lib/company/ideas";
import { _clearApprovals } from "../lib/approvals";

describe("daily digest (F5)", () => {
  beforeEach(() => {
    _clearIdeas();
    _clearApprovals();
  });

  it("composes an Arabic brief with the key numbers", () => {
    submitIdea({ title: "فكرة تجريبية للملخص", hypothesis: "ف", budgetSAR: 30_000, horizonDays: 30 });
    const d = composeDigest();
    expect(d.text).toContain("ملخص شركة النجمة الذهبية");
    expect(d.pendingDecisions).toBeGreaterThanOrEqual(1);
    expect(d.topPending.length).toBeGreaterThan(0);
    expect(d.text).toContain("مركز القرار");
  });

  it("headline reflects whether decisions are pending", () => {
    const empty = composeDigest();
    // A daily team idea is auto-created, so there is at least one pending item.
    expect(empty.headline).toContain("بانتظار اعتمادك");
  });

  it("dispatch records safely when no channel is configured", async () => {
    const { dispatch } = await dispatchDigest();
    expect(dispatch.sent).toBe(false);
    expect(dispatch.channel).toBe("none");
    expect(dispatch.reason).toContain("تسجيل");
  });
});
