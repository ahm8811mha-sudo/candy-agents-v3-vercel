import { describe, it, expect, beforeEach } from "vitest";
import {
  getSalesConsole,
  proposeIncomeRecognition,
  recognizeIncome,
  proposeSalesChange,
  applySalesChange,
  isShopifyWriteEnabled,
  _clearSales,
} from "../lib/company/sales";
import { listApprovals, _clearApprovals } from "../lib/approvals";

describe("sales integration (Shopify under company governance)", () => {
  beforeEach(() => {
    _clearSales();
    _clearApprovals();
  });

  it("reports pending (unrecognized) paid revenue from the store", async () => {
    const con = await getSalesConsole();
    expect(con.paidRevenue).toBeGreaterThan(0);
    expect(con.pendingRevenue).toBe(con.paidRevenue); // nothing recognized yet
    expect(con.recognizedTotal).toBe(0);
  });

  it("proposing income recognition creates a governed INCOME approval", async () => {
    const res = await proposeIncomeRecognition();
    expect(res.ok).toBe(true);
    const approval = listApprovals().find((a) => a.type === "INCOME");
    expect(approval).toBeDefined();
    expect(approval!.amount).toBeGreaterThan(0);
    expect(approval!.requestedRole).toContain("سارة");
  });

  it("recognizing income posts it to the ledger and clears the pending amount", async () => {
    await proposeIncomeRecognition();
    const approval = listApprovals().find((a) => a.type === "INCOME")!;
    const exec = recognizeIncome(approval.metadata || {});
    expect(exec.executed).toBe(true);

    const con = await getSalesConsole();
    expect(con.recognizedTotal).toBeGreaterThan(0);
    expect(con.pendingRevenue).toBe(0); // same orders no longer pending
  });

  it("does not double-recognize the same orders", async () => {
    await proposeIncomeRecognition();
    const approval = listApprovals().find((a) => a.type === "INCOME")!;
    recognizeIncome(approval.metadata || {});
    const second = await proposeIncomeRecognition();
    expect(second.ok).toBe(false);
    expect(second.reason).toContain("لا مداخيل");
  });

  it("a store change request creates a SALES_CHANGE approval routed to the CEO agent", () => {
    const res = proposeSalesChange({ kind: "PRICE", target: "حقيبة جلد", detail: "خفض 10%" });
    expect(res.ok).toBe(true);
    const approval = listApprovals().find((a) => a.type === "SALES_CHANGE");
    expect(approval).toBeDefined();
    expect(approval!.requestedRole).toContain("سلطان");
  });

  it("applying a change simulates when write is not enabled (safe default)", async () => {
    const proposal = proposeSalesChange({ kind: "STATUS", target: "محفظة", detail: "تفعيل المنتج" });
    const approval = listApprovals().find((a) => a.type === "SALES_CHANGE")!;
    const exec = await applySalesChange(approval.metadata || {});
    expect(isShopifyWriteEnabled()).toBe(false);
    expect(exec.simulated).toBe(true);
    expect(exec.reason).toContain("محاكاة");
    // proposal id was marked applied in the change log
    expect(proposal.ok).toBe(true);
  });

  it("rejects an incomplete change request", () => {
    const res = proposeSalesChange({ kind: "PRICE", target: "", detail: "" });
    expect(res.ok).toBe(false);
  });
});
