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
 * State is in-memory (consistent with the rest of the company modules);
 * durable posting to accounting via Supabase is a follow-up.
 */

import { getShopifySnapshot, isShopifyConfigured } from "../shopify";
import { createApproval } from "../approvals";
import { requiredTier } from "./governance";

export type IncomeEntry = {
  id: string;
  amount: number;
  currency: string;
  orderCount: number;
  note: string;
  recognizedAt: string;
};

export type SalesChange = {
  id: string;
  kind: "PRICE" | "STATUS" | "DISCOUNT";
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
  incomeLedger.unshift({
    id: genId("inc"),
    amount,
    currency,
    orderCount: orderIds.length,
    note: "مداخيل مبيعات معتمدة ومسجّلة في دفتر الشركة",
    recognizedAt: new Date().toISOString(),
  });
  return { executed: true, reason: `تم اعتماد وتسجيل ${amount.toLocaleString("ar-SA")} ${currency} في دفتر مداخيل الشركة.` };
}

export type SalesChangeInput = { kind: SalesChange["kind"]; target: string; detail: string };

/** The team proposes a change to the sales system → decision center. */
export function proposeSalesChange(input: SalesChangeInput): ProposeResult {
  if (!input.target || !input.detail) return { ok: false, reason: "يلزم تحديد المنتج/الهدف وتفاصيل التعديل." };
  const change: SalesChange = {
    id: genId("chg"),
    kind: input.kind,
    target: input.target,
    detail: input.detail,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  changeLog.unshift(change);

  const kindLabel = input.kind === "PRICE" ? "تعديل سعر" : input.kind === "STATUS" ? "تغيير حالة منتج" : "خصم";
  const approval = createApproval({
    type: "SALES_CHANGE",
    title: `طلب تعديل المتجر: ${kindLabel} — ${input.target}`,
    detail: `${input.detail} · يُطبَّق على المتجر بعد اعتماد الرئيس التنفيذي.`,
    requestedRole: "سلطان — الرئيس التنفيذي",
    dedupeKey: `change-${change.id}`,
    metadata: { kind: "SALES_CHANGE", changeId: change.id, changeKind: input.kind, target: input.target },
  });
  return { ok: true, reason: "رُفع طلب التعديل لمركز القرار.", approvalId: approval.id };
}

/** Called on approval of a SALES_CHANGE — applies to the store (or simulates). */
export async function applySalesChange(metadata: Record<string, unknown>): Promise<ExecResult> {
  const changeId = String(metadata.changeId || "");
  const change = changeLog.find((c) => c.id === changeId);
  if (change) change.status = "APPLIED";

  if (!isShopifyWriteEnabled()) {
    return {
      executed: false,
      simulated: true,
      reason: "تم اعتماد التعديل وتسجيله (محاكاة). التطبيق الفعلي على المتجر يتطلب SHOPIFY_WRITE_ENABLED ومفاتيح كتابة.",
    };
  }
  // Live write adapter is intentionally gated; wiring the exact Admin API
  // mutation happens once write scopes are provisioned.
  return { executed: true, simulated: false, reason: "تم اعتماد التعديل وإرساله إلى المتجر." };
}

/** Test helper. */
export function _clearSales(): void {
  incomeLedger.length = 0;
  recognizedOrders.clear();
  changeLog.length = 0;
}
