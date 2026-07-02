/**
 * Approval center store.
 *
 * A single place where every item that needs human sign-off (trades above the
 * limit, budget gates, CEO decisions) is collected and acted on. Uses a
 * module-level in-memory store, consistent with the project's cache/rateLimit
 * pattern. Durable cross-instance persistence would back this with Supabase
 * (noted as a follow-up); the actionable approve/reject flow works as-is.
 */

export type ApprovalType = "TRADE" | "BUDGET" | "DECISION" | "IDEA" | "GENERAL";
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

export type CreateApprovalInput = {
  type: ApprovalType;
  title: string;
  detail: string;
  amount?: number;
  requestedRole?: string;
  metadata?: Record<string, unknown>;
  /** Optional idempotency key to avoid duplicate pending items. */
  dedupeKey?: string;
};

export function createApproval(input: CreateApprovalInput): ApprovalItem {
  if (input.dedupeKey) {
    const existing = store.find(
      (a) => a.status === "PENDING" && a.metadata?.dedupeKey === input.dedupeKey
    );
    if (existing) return existing;
  }

  const item: ApprovalItem = {
    id: genId(),
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
