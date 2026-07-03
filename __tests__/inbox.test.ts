import { describe, it, expect, beforeEach } from "vitest";
import { getInbox } from "../lib/inbox";
import { createApproval, _clearApprovals } from "../lib/approvals";
import { recordDecision, _clearDecisions } from "../lib/decisions";

describe("unified inbox", () => {
  beforeEach(() => {
    _clearApprovals();
    _clearDecisions();
  });

  it("includes system approvals as actionable via approvals endpoint", async () => {
    createApproval({ type: "TRADE", title: "صفقة AAPL", detail: "d", amount: 15000 });
    const inbox = await getInbox();
    const item = inbox.items.find((i) => i.title === "صفقة AAPL");
    expect(item).toBeDefined();
    expect(item!.channel).toBe("SYSTEM");
    expect(item!.actionsVia).toBe("approvals");
    expect(item!.status).toBe("PENDING");
  });

  it("includes company approvals from the repository (mock fallback)", async () => {
    const inbox = await getInbox();
    const company = inbox.items.filter((i) => i.channel === "COMPANY");
    expect(company.length).toBeGreaterThan(0);
    expect(company[0].actionsVia).toBe("decisions");
  });

  it("counts pending items", async () => {
    createApproval({ type: "TRADE", title: "معلقة", detail: "d" });
    const inbox = await getInbox();
    expect(inbox.pending).toBeGreaterThanOrEqual(1);
    expect(inbox.pending).toBe(inbox.items.filter((i) => i.status === "PENDING").length);
  });

  it("sorts pending items before decided ones", async () => {
    const a = createApproval({ type: "TRADE", title: "أولى", detail: "d" });
    createApproval({ type: "TRADE", title: "ثانية", detail: "d" });
    const { decideApproval } = await import("../lib/approvals");
    decideApproval(a.id, "APPROVED");
    const inbox = await getInbox();
    const firstDecidedIdx = inbox.items.findIndex((i) => i.status !== "PENDING");
    const lastPendingIdx = inbox.items.map((i) => i.status).lastIndexOf("PENDING");
    if (firstDecidedIdx !== -1 && lastPendingIdx !== -1) {
      expect(lastPendingIdx).toBeLessThan(firstDecidedIdx);
    }
  });

  it("company items reflect their latest review action", async () => {
    const before = await getInbox();
    const company = before.items.find((i) => i.channel === "COMPANY");
    expect(company).toBeDefined();
    recordDecision({ sourceType: "company-approval", sourceId: company!.id, title: company!.title, action: "FORWARDED", forwardedTo: "المالية" });
    const after = await getInbox();
    const updated = after.items.find((i) => i.channel === "COMPANY" && i.id === company!.id);
    expect(updated!.status).toBe("FORWARDED");
  });
});
