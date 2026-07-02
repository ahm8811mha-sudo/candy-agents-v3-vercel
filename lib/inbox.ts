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
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

export async function getInbox(): Promise<{ items: InboxItem[]; pending: number }> {
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

  // Pending first, newest first within each group.
  items.sort((a, b) => {
    const ap = a.status === "PENDING" ? 0 : 1;
    const bp = b.status === "PENDING" ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return { items, pending: items.filter((i) => i.status === "PENDING").length };
}
