/**
 * Approval center store.
 *
 * A single place where every item that needs human sign-off (trades above the
 * limit, budget gates, CEO decisions) is collected and acted on. The in-memory
 * store is a compatibility snapshot. Critical reads refresh from Supabase;
 * critical decisions commit the approval and audit entry atomically before
 * updating that snapshot. Legacy synchronous helpers remain for older callers.
 */

import { createHash } from "node:crypto";
import { persist, persistCritical, hasSupabaseEnv, getSupabaseAdmin } from "./supabase";
import { getTenantId } from "./tenant";
import { emitWebhook } from "./company/webhooks";

export type ApprovalType = "TRADE" | "BUDGET" | "DECISION" | "IDEA" | "INCOME" | "SALES_CHANGE" | "GENERAL";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "DEFERRED";

export type DeferralInfo = {
  reason: string;
  /** ISO date to bring the item back to the pending queue. */
  remindAt: string;
  /** The employee/agent responsible for preparing the item meanwhile. */
  assignedTo?: string;
  deferredBy: string;
  deferredAt: string;
};

export type ApprovalItem = {
  id: string;
  type: ApprovalType;
  title: string;
  detail: string;
  amount?: number;
  requestedRole: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

const store: ApprovalItem[] = [];

function genId() {
  return `apr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toRow(a: ApprovalItem): Record<string, unknown> {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    detail: a.detail,
    amount: a.amount ?? null,
    requested_role: a.requestedRole,
    status: a.status,
    created_at: a.createdAt,
    decided_at: a.decidedAt ?? null,
    decided_by: a.decidedBy ?? null,
    note: a.note ?? null,
    metadata: a.metadata ?? null,
    dedupe_key: a.dedupeKey ?? null,
  };
}

function fromRow(r: Record<string, unknown>): ApprovalItem {
  return {
    id: String(r.id),
    type: r.type as ApprovalType,
    title: String(r.title),
    detail: String(r.detail ?? ""),
    amount: r.amount != null ? Number(r.amount) : undefined,
    requestedRole: String(r.requested_role ?? "CEO"),
    status: r.status as ApprovalStatus,
    createdAt: String(r.created_at),
    decidedAt: r.decided_at ? String(r.decided_at) : undefined,
    decidedBy: r.decided_by ? String(r.decided_by) : undefined,
    note: r.note ? String(r.note) : undefined,
    metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
    dedupeKey: r.dedupe_key ? String(r.dedupe_key) : undefined,
  };
}

/** Cache a row that was already committed by a larger database transaction. */
export function rememberDurableApprovalRow(row: Record<string, unknown>): ApprovalItem {
  const item = fromRow(row);
  const index = store.findIndex((approval) => approval.id === item.id);
  if (index >= 0) store[index] = item;
  else store.unshift(item);
  return item;
}

/** Refresh from durable rows on every request; a failed read is not an empty queue. */
export async function hydrateApprovals(tenantId = getTenantId()) {
  const client = getSupabaseAdmin();
  if (!client) return;
  const rows: ApprovalItem[] = [];
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await client.from("company_approvals").select("*").eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }).order("id").range(offset, offset + 249);
    if (error) throw error;
    rows.push(...(data || []).map(fromRow));
    if (!data || data.length < 250) break;
  }
  store.splice(0, store.length, ...rows);
}

export type CreateApprovalInput = {
  type: ApprovalType;
  title: string;
  detail: string;
  amount?: number;
  requestedRole?: string;
  metadata?: Record<string, unknown>;
  /** Optional idempotency key to avoid duplicate pending items. */
  dedupeKey?: string;
  /** Optional deterministic id so concurrent cold starts upsert one row. */
  id?: string;
};

function findExistingApproval(input: CreateApprovalInput): ApprovalItem | null {
  if (input.dedupeKey) {
    const existing = store.find(
      (a) => a.status === "PENDING" && (a.dedupeKey === input.dedupeKey || a.metadata?.dedupeKey === input.dedupeKey)
    );
    if (existing) return existing;
  }
  // A deterministic id already present (hydrated or same process) is reused.
  if (input.id) {
    const existing = store.find((a) => a.id === input.id);
    if (existing) return existing;
  }
  return null;
}

function buildApproval(input: CreateApprovalInput): ApprovalItem {
  const deterministicId = input.dedupeKey
    ? `apr-dedupe-${createHash("sha256").update(input.dedupeKey).digest("hex").slice(0, 40)}`
    : undefined;
  return {
    id: input.id || deterministicId || genId(),
    type: input.type,
    title: input.title,
    detail: input.detail,
    amount: input.amount,
    requestedRole: input.requestedRole || "CEO",
    status: "PENDING",
    createdAt: new Date().toISOString(),
    metadata: { ...input.metadata, ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}) },
    dedupeKey: input.dedupeKey,
  };
}

async function findDurableApproval(id: string, dedupeKey?: string, tenantId = getTenantId()): Promise<ApprovalItem | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  if (dedupeKey) {
    const dedupeQuery = supabase
      .from("company_approvals")
      .select("*")
      .eq("dedupe_key", dedupeKey).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1);
    const { data: deduped, error: dedupeError } = await dedupeQuery.maybeSingle();
    if (dedupeError) throw dedupeError;
    if (deduped) return fromRow(deduped as Record<string, unknown>);
  }
  const query = supabase.from("company_approvals").select("*").eq("id", id).eq("tenant_id", tenantId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Record<string, unknown>) : null;
}

export function createApproval(input: CreateApprovalInput): ApprovalItem {
  const existing = findExistingApproval(input);
  if (existing) return existing;

  const item = buildApproval(input);
  store.unshift(item);
  persist("company_approvals", toRow(item));
  emitWebhook("approval.created", { id: item.id, type: item.type, title: item.title, amount: item.amount ?? null });
  return item;
}

/**
 * Awaited variant for API flows: the durable row is committed before the item
 * is accepted into the store, so success is never reported ahead of persistence.
 * Falls back to in-memory-only when Supabase is not configured (dev/demo mode).
 */
export async function createApprovalCritical(input: CreateApprovalInput): Promise<ApprovalItem> {
  const client = getSupabaseAdmin();
  if (!client) {
    if (process.env.NODE_ENV === "production") throw new Error("Durable approval storage is unavailable.");
    return createApproval(input);
  }
  const item = buildApproval(input);
  const durable = await findDurableApproval(item.id, item.dedupeKey);
  if (durable) return rememberDurableApprovalRow(toRow(durable));
  // DO NOTHING protects a concurrent decision from being reset to PENDING.
  const { error } = await client.from("company_approvals").upsert({ ...toRow(item), tenant_id: getTenantId() }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  const saved = await findDurableApproval(item.id);
  if (!saved) throw new Error("Approval was not confirmed by the database.");
  return rememberDurableApprovalRow(toRow(saved));
}

export function listApprovals(status?: ApprovalStatus): ApprovalItem[] {
  const items = status ? store.filter((a) => a.status === status) : store;
  return [...items];
}

export function decideApproval(
  id: string,
  decision: "APPROVED" | "REJECTED",
  decidedBy = "CEO",
  note?: string
): ApprovalItem | null {
  const item = store.find((a) => a.id === id);
  if (!item) return null;
  if (item.status !== "PENDING") return item;
  item.status = decision;
  item.decidedAt = new Date().toISOString();
  item.decidedBy = decidedBy;
  if (note) item.note = note;
  persist("company_approvals", toRow(item));
  emitWebhook("approval.decided", { id: item.id, type: item.type, title: item.title, decision, decidedBy });
  return item;
}

/**
 * Awaited variant for API flows: the decision is committed durably before the
 * in-memory item flips, so a sign-off can never be reported and then lost.
 * Falls back to in-memory-only when Supabase is not configured (dev/demo mode).
 */
export async function decideApprovalCritical(
  id: string, decision: "APPROVED" | "REJECTED", decidedBy = "CEO", note?: string, tenantId = getTenantId()
): Promise<ApprovalItem | null> {
  const client = getSupabaseAdmin();
  if (!client) {
    if (process.env.NODE_ENV === "production") throw new Error("Durable decision storage is unavailable.");
    return decideApproval(id, decision, decidedBy, note);
  }
  const { data, error } = await client.rpc("orvanta_decide_approval", {
    p_tenant_id: tenantId, p_id: id, p_decision: decision, p_actor: decidedBy, p_note: note || null,
  });
  if (error) throw error;
  if (!data?.id) throw new Error("Decision commit was not confirmed.");
  return rememberDurableApprovalRow(data);
}

/**
 * Restores a failed governed transition to the visible queue so it can be
 * retried instead of disappearing as an approved-but-unexecuted item.
 */
export async function reopenApprovalCritical(id: string): Promise<ApprovalItem | null> {
  const item = store.find((approval) => approval.id === id);
  if (!item) return null;
  const reopened: ApprovalItem = {
    ...item,
    status: "PENDING",
    decidedAt: undefined,
    decidedBy: undefined,
    note: undefined,
  };
  if (hasSupabaseEnv()) await persistCritical("company_approvals", toRow(reopened));
  Object.assign(item, reopened);
  return item;
}

export function approvalStats(): { pending: number; approved: number; rejected: number; deferred: number; total: number } {
  return {
    pending: store.filter((a) => a.status === "PENDING").length,
    approved: store.filter((a) => a.status === "APPROVED").length,
    rejected: store.filter((a) => a.status === "REJECTED").length,
    deferred: store.filter((a) => a.status === "DEFERRED").length,
    total: store.length,
  };
}

/** Find an approval locally, falling back to the database across instances. */
export async function getApprovalCritical(id: string, tenantId = getTenantId()): Promise<ApprovalItem | null> {
  if (!getSupabaseAdmin()) return store.find((a) => a.id === id) || null;
  const durable = await findDurableApproval(id, undefined, tenantId);
  return durable ? rememberDurableApprovalRow(toRow(durable)) : null;
}

/**
 * Defer a pending item: it leaves the queue with a reason, a reminder date,
 * and an assignee responsible for preparing it, then comes back automatically
 * once the reminder date passes (reviveDueDeferrals).
 */
export async function deferApprovalCritical(
  id: string,
  input: { reason: string; remindAt: string; assignedTo?: string; deferredBy: string }
): Promise<ApprovalItem | null> {
  const reason = input.reason.trim();
  const remindAt = new Date(input.remindAt);
  if (!reason) throw new Error("سبب التأجيل مطلوب.");
  if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() <= Date.now()) {
    throw new Error("تاريخ التذكير يجب أن يكون تاريخاً صالحاً في المستقبل.");
  }

  const item = await getApprovalCritical(id);
  if (!item) return null;
  if (item.status !== "PENDING") return item;

  const deferral: DeferralInfo = {
    reason,
    remindAt: remindAt.toISOString(),
    assignedTo: input.assignedTo?.trim() || undefined,
    deferredBy: input.deferredBy,
    deferredAt: new Date().toISOString(),
  };
  const deferred: ApprovalItem = {
    ...item,
    status: "DEFERRED",
    note: reason,
    metadata: { ...item.metadata, deferral },
  };
  const client = getSupabaseAdmin();
  if (client) {
    const { data, error } = await client.rpc("orvanta_change_deferral", { p_tenant_id: getTenantId(), p_id: id, p_actor: input.deferredBy, p_deferral: deferral });
    if (error) throw error;
    return rememberDurableApprovalRow(data);
  }
  if (process.env.NODE_ENV === "production") throw new Error("Durable approval storage is unavailable.");
  Object.assign(item, deferred);
  emitWebhook("approval.deferred", {
    id: item.id,
    type: item.type,
    title: item.title,
    remindAt: deferral.remindAt,
    assignedTo: deferral.assignedTo ?? null,
  });
  return item;
}

/** Bring deferred items whose reminder date passed back to the pending queue. */
export async function reviveDueDeferrals(): Promise<ApprovalItem[]> {
  const now = Date.now();
  const revived: ApprovalItem[] = [];
  for (const item of store) {
    if (item.status !== "DEFERRED") continue;
    const deferral = item.metadata?.deferral as DeferralInfo | undefined;
    const due = deferral?.remindAt ? Date.parse(deferral.remindAt) : NaN;
    if (Number.isNaN(due) || due > now) continue;

    const client = getSupabaseAdmin();
    if (client) {
      const { data, error } = await client.rpc("orvanta_change_deferral", { p_tenant_id: getTenantId(), p_id: item.id, p_actor: "scheduler", p_deferral: null });
      if (error) throw error;
      const saved = rememberDurableApprovalRow(data);
      if (saved.status === "PENDING") revived.push(saved);
      continue;
    }

    item.status = "PENDING";
    item.note = `عادت للصندوق بعد التأجيل — السبب السابق: ${deferral?.reason ?? "غير مذكور"}`;
    item.metadata = { ...item.metadata, deferral: { ...deferral, revivedAt: new Date().toISOString() } };
    persist("company_approvals", toRow(item));
    emitWebhook("approval.revived", { id: item.id, type: item.type, title: item.title });
    revived.push(item);
  }
  return revived;
}

/** Test helper — clears the store. */
export function _clearApprovals(): void {
  store.length = 0;
}
