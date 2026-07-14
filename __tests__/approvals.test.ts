import { describe, it, expect, beforeEach } from "vitest";
import {
  createApproval,
  listApprovals,
  decideApproval,
  approvalStats,
  reopenApprovalCritical,
  _clearApprovals,
} from "../lib/approvals";

describe("approvals", () => {
  beforeEach(() => {
    _clearApprovals();
  });

  it("creates a pending approval", () => {
    const item = createApproval({ type: "TRADE", title: "صفقة", detail: "تفاصيل", amount: 12000 });
    expect(item.status).toBe("PENDING");
    expect(item.amount).toBe(12000);
    expect(listApprovals("PENDING")).toHaveLength(1);
  });

  it("dedupes pending items by dedupeKey", () => {
    createApproval({ type: "TRADE", title: "a", detail: "d", dedupeKey: "k1" });
    createApproval({ type: "TRADE", title: "a", detail: "d", dedupeKey: "k1" });
    expect(listApprovals("PENDING")).toHaveLength(1);
  });

  it("uses the same durable id after a serverless cold start", () => {
    const first = createApproval({ type: "TRADE", title: "a", detail: "d", dedupeKey: "stable-key" });
    _clearApprovals();
    const second = createApproval({ type: "TRADE", title: "a", detail: "d", dedupeKey: "stable-key" });
    expect(second.id).toBe(first.id);
  });

  it("approves an item and updates stats", () => {
    const item = createApproval({ type: "TRADE", title: "صفقة", detail: "d" });
    const decided = decideApproval(item.id, "APPROVED", "CEO");
    expect(decided?.status).toBe("APPROVED");
    expect(decided?.decidedBy).toBe("CEO");
    expect(decided?.decidedAt).toBeTruthy();
    const stats = approvalStats();
    expect(stats.approved).toBe(1);
    expect(stats.pending).toBe(0);
  });

  it("rejects an item with a note", () => {
    const item = createApproval({ type: "BUDGET", title: "ميزانية", detail: "d" });
    const decided = decideApproval(item.id, "REJECTED", "CEO", "خارج النطاق");
    expect(decided?.status).toBe("REJECTED");
    expect(decided?.note).toBe("خارج النطاق");
  });

  it("does not re-decide an already decided item", () => {
    const item = createApproval({ type: "TRADE", title: "صفقة", detail: "d" });
    decideApproval(item.id, "APPROVED");
    const second = decideApproval(item.id, "REJECTED");
    expect(second?.status).toBe("APPROVED"); // unchanged
  });

  it("returns a failed governed transition to the pending queue", async () => {
    const item = createApproval({ type: "GENERAL", title: "حملة", detail: "d" });
    decideApproval(item.id, "APPROVED", "المالك");
    const reopened = await reopenApprovalCritical(item.id);
    expect(reopened?.status).toBe("PENDING");
    expect(reopened?.decidedAt).toBeUndefined();
  });

  it("returns null for an unknown id", () => {
    expect(decideApproval("missing", "APPROVED")).toBeNull();
  });

  it("filters by status", () => {
    const a = createApproval({ type: "TRADE", title: "1", detail: "d" });
    createApproval({ type: "TRADE", title: "2", detail: "d" });
    decideApproval(a.id, "APPROVED");
    expect(listApprovals("PENDING")).toHaveLength(1);
    expect(listApprovals("APPROVED")).toHaveLength(1);
    expect(listApprovals()).toHaveLength(2);
  });
});
