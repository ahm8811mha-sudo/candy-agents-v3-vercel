import { describe, it, expect, beforeEach } from "vitest";
import { getCompanyPulse } from "../lib/company/pulse";
import { submitIdea, _clearIdeas } from "../lib/company/ideas";
import { listApprovals, decideApproval, _clearApprovals } from "../lib/approvals";
import { _clearDecisions, recordDecision } from "../lib/decisions";

describe("company pulse", () => {
  beforeEach(() => {
    _clearIdeas();
    _clearApprovals();
    _clearDecisions();
  });

  it("derives events from a submitted idea (proposer + 3 studies + summary + gate)", () => {
    submitIdea({ title: "فكرة نبض", hypothesis: "ف", budgetSAR: 10_000, horizonDays: 30 });
    const pulse = getCompanyPulse();
    const kinds = pulse.events.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["IDEA", "STUDY", "SUMMARY", "GATE"]));
    expect(pulse.events.filter((e) => e.kind === "STUDY")).toHaveLength(3);
  });

  it("marks the studying agents as WORKING right after activity", () => {
    submitIdea({ title: "فكرة نشاط", hypothesis: "ف", budgetSAR: 8_000, horizonDays: 21 });
    const pulse = getCompanyPulse();
    const cfo = pulse.agents.find((a) => a.id === "abdulrahman")!;
    const sultan = pulse.agents.find((a) => a.id === "sultan")!;
    expect(cfo.presence).toBe("WORKING");
    expect(sultan.presence).toBe("WORKING");
    expect(pulse.workingCount).toBeGreaterThanOrEqual(4);
  });

  it("agents with no records are IDLE (honesty rule)", () => {
    const pulse = getCompanyPulse();
    const sara = pulse.agents.find((a) => a.id === "sara")!;
    expect(sara.presence).toBe("IDLE");
    expect(sara.lastAction).toBeUndefined();
  });

  it("owner sign-offs appear as SIGNOFF events", () => {
    submitIdea({ title: "فكرة توقيع", hypothesis: "ف", budgetSAR: 40_000, horizonDays: 30 });
    const approval = listApprovals()[0];
    decideApproval(approval.id, "APPROVED", "المالك");
    const pulse = getCompanyPulse();
    const signoff = pulse.events.find((e) => e.kind === "SIGNOFF");
    expect(signoff).toBeDefined();
    expect(signoff!.agentName).toBe("المالك");
    expect(signoff!.title).toContain("اعتمد");
  });

  it("review actions (forward/note) appear as REVIEW events", () => {
    recordDecision({ sourceType: "company-approval", sourceId: "x1", title: "طلب قسم", action: "FORWARDED", forwardedTo: "المالية" });
    const pulse = getCompanyPulse();
    const review = pulse.events.find((e) => e.kind === "REVIEW");
    expect(review).toBeDefined();
    expect(review!.title).toContain("أحال");
    expect(review!.title).toContain("المالية");
  });

  it("events are sorted newest first", () => {
    submitIdea({ title: "أ", hypothesis: "ف", budgetSAR: 5_000, horizonDays: 14 });
    const pulse = getCompanyPulse();
    for (let i = 1; i < pulse.events.length; i++) {
      expect(pulse.events[i - 1].createdAt >= pulse.events[i].createdAt).toBe(true);
    }
  });
});
