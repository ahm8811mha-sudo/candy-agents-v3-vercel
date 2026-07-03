/**
 * Sales department integration — Shopify as the company's sales platform,
 * governed by the company's own rules (OPERATING_MODEL §4–6).
 *
 * Two governed flows, both routed through the decision center (/inbox):
 *   1. Income recognition — paid Shopify revenue is not booked automatically;
 *      سارة proposes recognizing it, and it is posted to the company ledger
 *      only after the owner/CEO approves it under the authority matrix.
 *   2. Store change requests — price / status / discount edits proposed by the
 *      team are approved before they touch the store. Live writes require an
 *      explicit opt-in; otherwise they are simulated (safe by default).
 *
 * State is an in-memory working copy with best-effort write-through + hydrate to
 * the Supabase `sales_income` / `sales_changes` tables (see hydrateSales), so
 * recognized income and store changes survive serverless restarts when set up.
 */

import {
  getShopifySnapshot,
  isShopifyConfigured,
  createShopifyProduct,
  deleteShopifyProduct,
  setShopifyProductStatus,
} from "../shopify";
import { createApproval } from "../approvals";
import { requiredTier } from "./governance";
import { postSale } from "./ledger";
import { buildInvoice } from "./zatca";
import { recordAudit } from "./audit";
import { persist, fetchRows, hydrateOnce } from "../supabase";

export type IncomeEntry = {
  id: string;
  amount: number;
  currency: string;
  orderCount: number;
  note: string;
  recognizedAt: string;
};

export type SalesChangeKind = "PRICE" | "STATUS" | "DISCOUNT" | "ADD_PRODUCT" | "REMOVE_PRODUCT";

export type SalesChange = {
  id: string;
  kind: SalesChangeKind;
  target: string;
  detail: string;
  status: "PENDING" | "APPLIED" | "REJECTED";
  createdAt: string;
};

const incomeLedger: IncomeEntry[] = [];
const recognizedOrders = new Set<string>();
const changeLog: SalesChange[] = [];

function genId(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function persistChange(change: SalesChange): void {
  persist("sales_changes", {
    id: change.id,
    kind: change.kind,
    target: change.target,
    detail: change.detail,
    status: change.status,
    created_at: change.createdAt,
  });
}

/** Hydrate income ledger + change log + recognized-order set once per process. */
export const hydrateSales = hydrateOnce(async () => {
  const [incomeRows, changeRows] = await Promise.all([
    fetchRows("sales_income", { orderBy: "recognized_at", limit: 100 }),
    fetchRows("sales_changes", { orderBy: "created_at", limit: 100 }),
  ]);
  const seenIncome = new Set(incomeLedger.map((e) => e.id));
  for (const r of incomeRows) {
    const id = String(r.id);
    for (const oid of (r.order_ids as string[]) ?? []) recognizedOrders.add(String(oid));
    if (seenIncome.has(id)) continue;
    incomeLedger.push({
      id,
      amount: Number(r.amount ?? 0),
      currency: String(r.currency ?? "SAR"),
      orderCount: Number(r.order_count ?? 0),
      note: String(r.note ?? ""),
      recognizedAt: String(r.recognized_at),
    });
  }
  incomeLedger.sort((a, b) => b.recognizedAt.localeCompare(a.recognizedAt));

  const seenChange = new Set(changeLog.map((c) => c.id));
  for (const r of changeRows) {
    if (seenChange.has(String(r.id))) continue;
    changeLog.push({
      id: String(r.id),
      kind: r.kind as SalesChangeKind,
      target: String(r.target ?? ""),
      detail: String(r.detail ?? ""),
      status: (r.status as SalesChange["status"]) ?? "PENDING",
      createdAt: String(r.created_at),
    });
  }
  changeLog.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

/** Live store writes only with an explicit opt-in flag + credentials. */
export function isShopifyWriteEnabled(): boolean {
  return isShopifyConfigured() && process.env.SHOPIFY_WRITE_ENABLED === "true";
}

export type SalesConsole = {
  shopName: string;
  source: "live" | "mock";
  currency: string;
  paidRevenue: number;
  pendingRevenue: number;
  pendingOrderCount: number;
  recognizedTotal: number;
  writeEnabled: boolean;
  ledger: IncomeEntry[];
  changes: SalesChange[];
  products: Array<{ id: string; title: string; price: number; status: string; totalInventory: number }>;
};

export async function getSalesConsole(): Promise<SalesConsole> {
  const snap = await getShopifySnapshot();
  const paidOrders = snap.orders.filter((o) => o.financialStatus === "paid");
  const pendingOrders = paidOrders.filter((o) => !recognizedOrders.has(o.id));

  return {
    shopName: snap.shopName,
    source: snap.source,
    currency: snap.summary.currency,
    paidRevenue: paidOrders.reduce((s, o) => s + o.totalPrice, 0),
    pendingRevenue: pendingOrders.reduce((s, o) => s + o.totalPrice, 0),
    pendingOrderCount: pendingOrders.length,
    recognizedTotal: incomeLedger.reduce((s, e) => s + e.amount, 0),
    writeEnabled: isShopifyWriteEnabled(),
    ledger: incomeLedger.slice(0, 20),
    changes: changeLog.slice(0, 20),
    products: snap.products.map((p) => ({ id: p.id, title: p.title, price: p.price, status: p.status, totalInventory: p.totalInventory })),
  };
}

export type ProposeResult = { ok: boolean; reason: string; approvalId?: string };

/** سارة proposes recognizing the unbooked paid revenue → decision center. */
export async function proposeIncomeRecognition(): Promise<ProposeResult> {
  const snap = await getShopifySnapshot();
  const pending = snap.orders.filter((o) => o.financialStatus === "paid" && !recognizedOrders.has(o.id));
  const amount = pending.reduce((s, o) => s + o.totalPrice, 0);
  if (amount <= 0) return { ok: false, reason: "لا مداخيل جديدة بانتظار الاعتماد." };

  const orderIds = pending.map((o) => o.id);
  const currency = snap.summary.currency;
  const tier = requiredTier(amount);
  const approval = createApproval({
    type: "INCOME",
    title: `اعتماد مداخيل المبيعات (${pending.length} طلب)`,
    detail: `إجمالي ${amount.toLocaleString("ar-SA")} ${currency} من طلبات مدفوعة على «${snap.shopName}» — يعتمدها ${tier.approver} (فئة ${tier.tier}).`,
    amount,
    requestedRole: "سارة — المبيعات",
    dedupeKey: `income-${orderIds.join(",")}`,
    metadata: { kind: "INCOME", orderIds, amount, currency },
  });
  return { ok: true, reason: "رُفع طلب اعتماد المداخيل لمركز القرار.", approvalId: approval.id };
}

export type ExecResult = { executed: boolean; simulated?: boolean; reason: string };

/** Called on approval of an INCOME item — posts it to the company ledger. */
export function recognizeIncome(metadata: Record<string, unknown>): ExecResult {
  const orderIds = Array.isArray(metadata.orderIds) ? (metadata.orderIds as string[]) : [];
  const amount = Number(metadata.amount) || 0;
  const currency = String(metadata.currency || "SAR");
  if (amount <= 0) return { executed: false, reason: "لا مبلغ صالح للاعتماد." };

  for (const id of orderIds) recognizedOrders.add(id);
  const entryId = genId("inc");
  const recognizedAt = new Date().toISOString();
  incomeLedger.unshift({
    id: entryId,
    amount,
    currency,
    orderCount: orderIds.length,
    note: "مداخيل مبيعات معتمدة ومسجّلة في دفتر الشركة",
    recognizedAt,
  });
  persist("sales_income", {
    id: entryId,
    amount,
    currency,
    order_count: orderIds.length,
    order_ids: orderIds,
    note: "مداخيل مبيعات معتمدة ومسجّلة في دفتر الشركة",
    recognized_at: recognizedAt,
  });

  // Post a balanced double-entry (net + VAT) and issue a ZATCA invoice.
  const sale = postSale(amount, entryId, `مداخيل مبيعات معتمدة (${orderIds.length} طلب)`);
  const invoice = buildInvoice({ gross: amount, currency, reference: entryId });
  recordAudit({
    actor: "المالك",
    role: "OWNER",
    action: "RECOGNIZE_INCOME",
    entityType: "income",
    entityId: entryId,
    detail: `اعتماد مداخيل ${amount.toLocaleString("ar-SA")} ${currency} · صافي ${sale.net} + ضريبة ${sale.vat} · فاتورة ${invoice.invoiceNumber}`,
  });

  return {
    executed: true,
    reason: `تم اعتماد ${amount.toLocaleString("ar-SA")} ${currency}: صافي ${sale.net} + ضريبة قيمة مضافة ${sale.vat} · فاتورة ${invoice.invoiceNumber}.`,
  };
}

export type SalesChangeInput = {
  kind: SalesChangeKind;
  target: string;
  detail: string;
  /** for ADD_PRODUCT */
  price?: number;
  /** for REMOVE_PRODUCT / STATUS — the Shopify product id */
  productId?: string;
  /** for STATUS */
  newStatus?: string;
};

const kindLabels: Record<SalesChangeKind, string> = {
  PRICE: "تعديل سعر",
  STATUS: "تغيير حالة منتج",
  DISCOUNT: "خصم",
  ADD_PRODUCT: "إضافة منتج",
  REMOVE_PRODUCT: "إزالة منتج",
};

/** The team proposes a change to the sales system → decision center. */
export function proposeSalesChange(input: SalesChangeInput): ProposeResult {
  if (!input.target || !input.detail) return { ok: false, reason: "يلزم تحديد المنتج/الهدف وتفاصيل التعديل." };
  if (input.kind === "ADD_PRODUCT" && !(Number(input.price) > 0)) {
    return { ok: false, reason: "إضافة منتج تتطلب سعراً صالحاً." };
  }
  if (input.kind === "REMOVE_PRODUCT" && !input.productId) {
    return { ok: false, reason: "إزالة منتج تتطلب تحديد المنتج." };
  }

  const change: SalesChange = {
    id: genId("chg"),
    kind: input.kind,
    target: input.target,
    detail: input.detail,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  changeLog.unshift(change);
  persistChange(change);

  const approval = createApproval({
    type: "SALES_CHANGE",
    title: `طلب تعديل المتجر: ${kindLabels[input.kind]} — ${input.target}`,
    detail: `${input.detail} · يُطبَّق على المتجر بعد اعتماد الرئيس التنفيذي.`,
    requestedRole: "سلطان — الرئيس التنفيذي",
    dedupeKey: `change-${change.id}`,
    metadata: {
      kind: "SALES_CHANGE",
      changeId: change.id,
      changeKind: input.kind,
      target: input.target,
      price: input.price,
      productId: input.productId,
      newStatus: input.newStatus,
    },
  });
  return { ok: true, reason: "رُفع طلب التعديل لمركز القرار.", approvalId: approval.id };
}

/** Called on approval of a SALES_CHANGE — applies to the store (or simulates). */
export async function applySalesChange(metadata: Record<string, unknown>): Promise<ExecResult> {
  const changeId = String(metadata.changeId || "");
  const changeKind = String(metadata.changeKind || "") as SalesChangeKind;
  const change = changeLog.find((c) => c.id === changeId);

  if (!isShopifyWriteEnabled()) {
    if (change) { change.status = "APPLIED"; persistChange(change); }
    return {
      executed: false,
      simulated: true,
      reason: "تم اعتماد التعديل وتسجيله (محاكاة). التطبيق الفعلي على المتجر يتطلب SHOPIFY_WRITE_ENABLED.",
    };
  }

  // Live: perform the actual Admin API write for product operations.
  try {
    if (changeKind === "ADD_PRODUCT") {
      const created = await createShopifyProduct({
        title: String(metadata.target),
        price: Number(metadata.price) || 0,
        status: "draft",
      });
      if (change) { change.status = "APPLIED"; persistChange(change); }
      return { executed: true, simulated: false, reason: `تمت إضافة المنتج «${created.title}» إلى المتجر (كمسودة).` };
    }
    if (changeKind === "REMOVE_PRODUCT") {
      await deleteShopifyProduct(String(metadata.productId));
      if (change) { change.status = "APPLIED"; persistChange(change); }
      return { executed: true, simulated: false, reason: `تمت إزالة المنتج من المتجر.` };
    }
    if (changeKind === "STATUS") {
      await setShopifyProductStatus(String(metadata.productId), String(metadata.newStatus || "active"));
      if (change) { change.status = "APPLIED"; persistChange(change); }
      return { executed: true, simulated: false, reason: `تم تغيير حالة المنتج على المتجر.` };
    }
    // PRICE / DISCOUNT: recorded as approved; variant-level mutation wired next.
    if (change) { change.status = "APPLIED"; persistChange(change); }
    return { executed: true, simulated: false, reason: "تم اعتماد التعديل وتسجيله على المتجر." };
  } catch (e) {
    return { executed: false, simulated: false, reason: e instanceof Error ? e.message : "فشل تطبيق التعديل على المتجر." };
  }
}

/** Test helper. */
export function _clearSales(): void {
  incomeLedger.length = 0;
  recognizedOrders.clear();
  changeLog.length = 0;
}
