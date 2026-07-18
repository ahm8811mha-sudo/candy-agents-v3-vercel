import { describe, it, expect, beforeEach } from "vitest";
import {
  createApproval,
  listApprovals,
  decideApproval,
  approvalStats,
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

describe("deferral flow", () => {
  it("defers a pending item with reason, reminder date, and assignee", async () => {
    const { createApproval, deferApprovalCritical, listApprovals, approvalStats } = await import("../lib/approvals");
    const item = createApproval({ type: "IDEA", title: "فكرة للتأجيل", detail: "تفاصيل", amount: 5000 });
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

    const deferred = await deferApprovalCritical(item.id, {
      reason: "بانتظار عرض سعر المورد",
      remindAt: tomorrow,
      assignedTo: "مدير المشتريات",
      deferredBy: "المالك",
    });

    expect(deferred?.status).toBe("DEFERRED");
    expect(deferred?.metadata?.deferral).toMatchObject({
      reason: "بانتظار عرض سعر المورد",
      assignedTo: "مدير المشتريات",
    });
    expect(listApprovals("PENDING").some((a) => a.id === item.id)).toBe(false);
    expect(approvalStats().deferred).toBeGreaterThan(0);
  });

  it("rejects a past reminder date and an empty reason", async () => {
    const { createApproval, deferApprovalCritical } = await import("../lib/approvals");
    const item = createApproval({ type: "GENERAL", title: "عنصر", detail: "-" });
    await expect(
      deferApprovalCritical(item.id, { reason: "", remindAt: new Date(Date.now() + 86_400_000).toISOString(), deferredBy: "x" })
    ).rejects.toThrow("سبب التأجيل");
    await expect(
      deferApprovalCritical(item.id, { reason: "سبب", remindAt: new Date(Date.now() - 1000).toISOString(), deferredBy: "x" })
    ).rejects.toThrow("المستقبل");
  });

  it("revives deferred items whose reminder date passed", async () => {
    const { createApproval, deferApprovalCritical, reviveDueDeferrals, listApprovals } = await import("../lib/approvals");
    const item = createApproval({ type: "IDEA", title: "فكرة تعود", detail: "-" });
    await deferApprovalCritical(item.id, {
      reason: "تجهيز الدراسة",
      remindAt: new Date(Date.now() + 60_000).toISOString(),
      deferredBy: "المالك",
    });

    // Not due yet → nothing revives.
    expect((await reviveDueDeferrals()).some((a) => a.id === item.id)).toBe(false);

    // Force the reminder into the past, then revive.
    const stored = listApprovals().find((a) => a.id === item.id)!;
    (stored.metadata!.deferral as { remindAt: string }).remindAt = new Date(Date.now() - 1000).toISOString();
    const revived = await reviveDueDeferrals();
    expect(revived.some((a) => a.id === item.id)).toBe(true);
    expect(listApprovals("PENDING").some((a) => a.id === item.id)).toBe(true);
    expect(stored.note).toContain("عادت للصندوق");
  });
});
