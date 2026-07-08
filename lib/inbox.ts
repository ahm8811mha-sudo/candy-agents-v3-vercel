/**
 * Unified decision inbox.
 *
 * The administrative fix for scattered approval centers: everything that waits
 * for a human decision — gated trades (lib/approvals), company/employee
 * approvals (repository), and review actions (lib/decisions history) — is
 * aggregated into ONE queue with a single item shape. The UI decides items via
 * the existing endpoints, so no execution logic is duplicated:
 *   - SYSTEM items (trades etc.)  → POST /api/approvals/decisions
 *   - COMPANY items (repository)  → POST /api/decisions (review actions)
 */

import { listApprovals as listSystemApprovals } from "./approvals";
import { listApprovals as listCompanyApprovals } from "./repository";
import { decisionMap } from "./decisions";
import { hydrateCompany } from "./company/hydrate";

export type InboxChannel = "SYSTEM" | "COMPANY";

export type InboxItem = {
  id: string;
  channel: InboxChannel;
  /** which decision endpoint acts on this item */
  actionsVia: "approvals" | "decisions";
  type: string;
  title: string;
  detail: string;
  amount?: number;
  requestedBy: string;
  status: string; // PENDING | APPROVED | REJECTED | NOTED | FORWARDED
  createdAt: string;
  metadata?: Record<string, unknown>;
  /** decision-latency telemetry (Amazon-style operational SLA) */
  ageHours?: number;
  ageLabel?: string;
  stale?: boolean;
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

/** Pending decisions older than this are flagged as stale (SLA breach). */
export const STALE_AFTER_HOURS = 24;

/** Age of a decision item — pure so the SLA math is unit-testable. */
export function decisionAge(createdAt: string, now: Date = new Date()): { hours: number; label: string; stale: boolean } {
  const created = new Date(createdAt).getTime();
  const hours = Number.isFinite(created) ? Math.max(0, (now.getTime() - created) / 3_600_000) : 0;
  const rounded = Math.round(hours * 10) / 10;
  let label: string;
  if (hours < 1) label = "منذ أقل من ساعة";
  else if (hours < 24) label = `منذ ${Math.round(hours)} ساعة`;
  else label = `منذ ${Math.round(hours / 24)} يوم`;
  return { hours: rounded, label, stale: hours >= STALE_AFTER_HOURS };
}

export async function getInbox(): Promise<{ items: InboxItem[]; pending: number; stale: number; oldestPendingHours: number }> {
  await hydrateCompany();
  const items: InboxItem[] = [];

  // 1) System approvals (trades, budget gates) — actionable via /api/approvals/decisions.
  for (const a of listSystemApprovals()) {
    items.push({
      id: a.id,
      channel: "SYSTEM",
      actionsVia: "approvals",
      type: a.type,
      title: a.title,
      detail: a.detail,
      amount: a.amount,
      requestedBy: a.requestedRole,
      status: a.status,
      createdAt: a.createdAt,
      metadata: a.metadata,
    });
  }

  // 2) Company approvals (repository: daily logs, entity approvals) — reviewed
  //    via the generic decisions endpoint. Their latest review action (if any)
  //    overrides the raw PENDING status so decided items don't reappear.
  try {
    const companyRows = (await listCompanyApprovals()) as Array<Record<string, unknown>>;
    const reviews = decisionMap("company-approval");
    for (const row of companyRows) {
      const id = str(row.id);
      if (!id) continue;
      const review = reviews[`company-approval:${id}`];
      const rawStatus = str(row.status, "PENDING").toUpperCase();
      items.push({
        id,
        channel: "COMPANY",
        actionsVia: "decisions",
        type: str(row.entityType ?? row.entity_type, "APPROVAL"),
        title: str(row.notes, str(row.entityType ?? row.entity_type, "طلب اعتماد")),
        detail: `مقدَّم من: ${str(row.requestedBy ?? row.requested_by, "غير محدد")} · المعتمد: ${str(row.approverId ?? row.approver_id, "CEO")}`,
        requestedBy: str(row.requestedBy ?? row.requested_by, "قسم"),
        status: review ? review.action : rawStatus,
        createdAt: str(row.createdAt ?? row.created_at, new Date().toISOString()),
      });
    }
  } catch {
    // repository unavailable — system items still flow.
  }

  // Decision-latency telemetry: every item carries its age; pending items past
  // the SLA are flagged stale so the owner sees what's been waiting too long.
  const now = new Date();
  for (const item of items) {
    const age = decisionAge(item.createdAt, now);
    item.ageHours = age.hours;
    item.ageLabel = age.label;
    item.stale = item.status === "PENDING" && age.stale;
  }

  // Pending first, newest first within each group.
  items.sort((a, b) => {
    const ap = a.status === "PENDING" ? 0 : 1;
    const bp = b.status === "PENDING" ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const pendingItems = items.filter((i) => i.status === "PENDING");
  return {
    items,
    pending: pendingItems.length,
    stale: pendingItems.filter((i) => i.stale).length,
    oldestPendingHours: pendingItems.reduce((max, i) => Math.max(max, i.ageHours ?? 0), 0),
  };
}
