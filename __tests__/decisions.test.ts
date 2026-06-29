import { describe, it, expect, beforeEach } from "vitest";
import {
  recordDecision,
  listDecisions,
  getDecision,
  decisionMap,
  decisionStats,
  _clearDecisions,
} from "../lib/decisions";

describe("decisions", () => {
  beforeEach(() => {
    _clearDecisions();
  });

  it("records an approval decision", () => {
    const rec = recordDecision({ sourceType: "task", sourceId: "t1", title: "مهمة", action: "APPROVED" });
    expect(rec.action).toBe("APPROVED");
    expect(rec.decidedBy).toBe("CEO");
    expect(getDecision("task", "t1")?.action).toBe("APPROVED");
  });

  it("returns the latest decision per item", () => {
    recordDecision({ sourceType: "task", sourceId: "t1", title: "مهمة", action: "NOTED", note: "أولى" });
    recordDecision({ sourceType: "task", sourceId: "t1", title: "مهمة", action: "APPROVED" });
    expect(getDecision("task", "t1")?.action).toBe("APPROVED");
  });

  it("stores a note", () => {
    recordDecision({ sourceType: "alert", sourceId: "a1", title: "تنبيه", action: "NOTED", note: "يحتاج متابعة" });
    expect(getDecision("alert", "a1")?.note).toBe("يحتاج متابعة");
  });

  it("forwards to a department", () => {
    recordDecision({ sourceType: "approval", sourceId: "ap1", title: "اعتماد", action: "FORWARDED", forwardedTo: "المالية" });
    expect(getDecision("approval", "ap1")?.forwardedTo).toBe("المالية");
  });

  it("builds a lookup map keyed by sourceType:sourceId", () => {
    recordDecision({ sourceType: "task", sourceId: "t1", title: "م", action: "APPROVED" });
    recordDecision({ sourceType: "project", sourceId: "p1", title: "م", action: "REJECTED" });
    const map = decisionMap();
    expect(map["task:t1"].action).toBe("APPROVED");
    expect(map["project:p1"].action).toBe("REJECTED");
  });

  it("filters decisions by sourceType", () => {
    recordDecision({ sourceType: "task", sourceId: "t1", title: "م", action: "APPROVED" });
    recordDecision({ sourceType: "alert", sourceId: "a1", title: "م", action: "REJECTED" });
    expect(listDecisions("task")).toHaveLength(1);
    expect(Object.keys(decisionMap("task"))).toEqual(["task:t1"]);
  });

  it("counts actions in stats", () => {
    recordDecision({ sourceType: "task", sourceId: "t1", title: "م", action: "APPROVED" });
    recordDecision({ sourceType: "task", sourceId: "t2", title: "م", action: "REJECTED" });
    recordDecision({ sourceType: "task", sourceId: "t3", title: "م", action: "FORWARDED", forwardedTo: "المالية" });
    const stats = decisionStats();
    expect(stats.APPROVED).toBe(1);
    expect(stats.REJECTED).toBe(1);
    expect(stats.FORWARDED).toBe(1);
  });
});
