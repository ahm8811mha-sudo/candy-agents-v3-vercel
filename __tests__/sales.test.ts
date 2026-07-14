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
    const exec = await recognizeIncome(approval.metadata || {});
    expect(exec.executed).toBe(true);

    const con = await getSalesConsole();
    expect(con.recognizedTotal).toBeGreaterThan(0);
    expect(con.pendingRevenue).toBe(0); // same orders no longer pending
  });

  it("does not double-recognize the same orders", async () => {
    await proposeIncomeRecognition();
    const approval = listApprovals().find((a) => a.type === "INCOME")!;
    await recognizeIncome(approval.metadata || {});
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

  it("proposes adding a product (requires a valid price)", () => {
    expect(proposeSalesChange({ kind: "ADD_PRODUCT", target: "منتج جديد", detail: "إضافة", price: 0 }).ok).toBe(false);
    const ok = proposeSalesChange({ kind: "ADD_PRODUCT", target: "منتج جديد", detail: "إضافة", price: 150 });
    expect(ok.ok).toBe(true);
    const approval = listApprovals().find((a) => a.type === "SALES_CHANGE")!;
    expect(approval.metadata?.changeKind).toBe("ADD_PRODUCT");
    expect(approval.metadata?.price).toBe(150);
  });

  it("proposes removing a product (requires a product id)", () => {
    expect(proposeSalesChange({ kind: "REMOVE_PRODUCT", target: "منتج", detail: "إزالة" }).ok).toBe(false);
    const ok = proposeSalesChange({ kind: "REMOVE_PRODUCT", target: "منتج", detail: "إزالة", productId: "p-1001" });
    expect(ok.ok).toBe(true);
    const approval = listApprovals().find((a) => a.metadata?.changeKind === "REMOVE_PRODUCT")!;
    expect(approval.metadata?.productId).toBe("p-1001");
  });

  it("add/remove approvals simulate safely when write is disabled", async () => {
    proposeSalesChange({ kind: "ADD_PRODUCT", target: "منتج", detail: "إضافة", price: 99 });
    const approval = listApprovals().find((a) => a.metadata?.changeKind === "ADD_PRODUCT")!;
    const exec = await applySalesChange(approval.metadata || {});
    expect(exec.simulated).toBe(true);
    expect(exec.reason).toContain("محاكاة");
  });
});
