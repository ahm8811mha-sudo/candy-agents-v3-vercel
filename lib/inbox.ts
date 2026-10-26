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

import { listApprovals as listSystemApprovals, reviveDueDeferrals } from "./approvals";
import { listApprovals as listCompanyApprovals } from "./repository";
import { decisionMap } from "./decisions";
import { hydrateCompany } from "./company/hydrate";
import { hydrateChairmanCommands, listChairmanCommands, publicCommandStatus } from "./company/chairmanCommands";
import { approvalVisibleToChairman,
  collapseDuplicates, formatDecisionMemo, isOwnerReadySpend, readSpendChain, spendReviewHistory, spendStop, toDecisionMemo } from "./company/spendChain";

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

export async function getInbox(): Promise<{
  items: InboxItem[];
  pending: number;
  stale: number;
  oldestPendingHours: number;
  commands: ReturnType<typeof publicCommandStatus>[];
}> {
  await hydrateCompany();
  await reviveDueDeferrals();
  await hydrateChairmanCommands();
  const items: InboxItem[] = [];

  // 1) System approvals. Pending money stays with the review chain until the
  // memo is complete. Non-financial decisions and already decided rows stay.
  // Repeats of the same request (same title + amount) are shown once with a count.
  const systemVisible = listSystemApprovals().filter((a) => approvalVisibleToChairman(a));
  const isOpen = (a: { status: string }) => a.status === "PENDING" || a.status === "DEFERRED";
  const systemRows: Array<(typeof systemVisible)[number] & { duplicateCount?: number; duplicateIds?: string[] }> = [
    ...collapseDuplicates(systemVisible.filter(isOpen)),
    ...systemVisible.filter((a) => !isOpen(a)),
  ];
  for (const a of systemRows) {
    const chain = readSpendChain(a);
    const stop = spendStop(chain);
    const memo = chain && (isOwnerReadySpend(chain) || stop) ? formatDecisionMemo(toDecisionMemo(a.id, chain)) : a.detail;
    const detail = stop ? `${stop.label}\nالسبب: ${stop.note}\n\n${memo}` : memo;
    items.push({
      id: a.id,
      channel: "SYSTEM",
      actionsVia: "approvals",
      type: a.type,
      title: a.duplicateCount && a.duplicateCount > 1 ? `${a.title} (مكرر ×${a.duplicateCount})` : a.title,
      detail,
      amount: a.amount,
      requestedBy: a.requestedRole,
      status: a.status,
      createdAt: a.createdAt,
      metadata: { ...a.metadata, chainStatus: stop ? { stopped: true, by: stop.by, label: stop.label } : undefined, reviewHistory: spendReviewHistory(chain), duplicateCount: a.duplicateCount, duplicateIds: a.duplicateIds },
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
    commands: listChairmanCommands().map(publicCommandStatus),
  };
}
