/**
 * Approval center store.
 *
 * A single place where every item that needs human sign-off (trades above the
 * limit, budget gates, CEO decisions) is collected and acted on. The in-memory
 * store is the fast working copy; when Supabase is configured every write is
 * also persisted to `company_approvals` and the store is hydrated from it once
 * per process (see hydrateApprovals), so decisions survive serverless restarts.
 */

import { persist, fetchRows, hydrateOnce } from "./supabase";

export type ApprovalType = "TRADE" | "BUDGET" | "DECISION" | "IDEA" | "INCOME" | "SALES_CHANGE" | "GENERAL";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

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
  };
}

/** Hydrate the store from Supabase once per process (before reads). */
export const hydrateApprovals = hydrateOnce(async () => {
  const rows = await fetchRows("company_approvals", { orderBy: "created_at", limit: 200 });
  const seen = new Set(store.map((a) => a.id));
  for (const r of rows) {
    if (seen.has(String(r.id))) continue;
    store.push(fromRow(r));
  }
  store.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

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

export function createApproval(input: CreateApprovalInput): ApprovalItem {
  if (input.dedupeKey) {
    const existing = store.find(
      (a) => a.status === "PENDING" && a.metadata?.dedupeKey === input.dedupeKey
    );
    if (existing) return existing;
  }
  // A deterministic id already present (hydrated or same process) is reused.
  if (input.id) {
    const existing = store.find((a) => a.id === input.id);
    if (existing) return existing;
  }

  const item: ApprovalItem = {
    id: input.id || genId(),
    type: input.type,
    title: input.title,
    detail: input.detail,
    amount: input.amount,
    requestedRole: input.requestedRole || "CEO",
    status: "PENDING",
    createdAt: new Date().toISOString(),
    metadata: { ...input.metadata, ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}) },
  };
  store.unshift(item);
  persist("company_approvals", toRow(item));
  return item;
}

export function listApprovals(status?: ApprovalStatus): ApprovalItem[] {
  const items = status ? store.filter((a) => a.status === status) : store;
  return items.slice(0, 100);
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
  return item;
}

export function approvalStats(): { pending: number; approved: number; rejected: number; total: number } {
  return {
    pending: store.filter((a) => a.status === "PENDING").length,
    approved: store.filter((a) => a.status === "APPROVED").length,
    rejected: store.filter((a) => a.status === "REJECTED").length,
    total: store.length,
  };
}

/** Test helper — clears the store. */
export function _clearApprovals(): void {
  store.length = 0;
}
