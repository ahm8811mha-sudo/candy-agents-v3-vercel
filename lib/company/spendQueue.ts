/**
 * Every open spend request with who holds it and for how long: the list the
 * dispatcher routine walks (GET /api/bridge/chairman/digest?view=spend).
 * "Stuck" = idle in a reviewer's stage past the SLA, or waiting on the
 * Chairman longer than the same SLA. Read-only.
 */
import { personName } from "./counterItems";
import {
  SPEND_STAGE_SLA_HOURS, collapseDuplicates, isArchived, isMonetarySpend, linkedProjectId, readSpendChain,
  returnedToDepartment, spendHolder, spendOverdue, spendStageSince,
} from "./spendChain";

type ApprovalLike = { id: string; title: string; amount?: number | null; status?: string; createdAt?: string; metadata?: Record<string, unknown> | null };

export type SpendQueueItem = {
  id: string;
  subject: string;
  amountSAR: number;
  stage: string;
  holder: string;
  holderName: string;
  createdAt: string;
  ageHours: number;
  stageSince: string;
  stageAgeHours: number;
  slaHours: number;
  stuck: boolean;
  overdueHours: number;
  returned: boolean;
  escalations: number;
  lastEscalatedAt: string | null;
  projectId: string | null;
  fileHref: string;
  actionPath: string | null;
};

const hoursBetween = (from: string, now: Date) => Math.max(0, Math.floor((now.getTime() - (Date.parse(from) || now.getTime())) / 3_600_000));

export function buildSpendQueue(approvals: ApprovalLike[], now = new Date()): SpendQueueItem[] {
  const open = approvals.filter((item) => (item.status === "PENDING" || item.status === "DEFERRED") && isMonetarySpend(item.amount) && !isArchived(item as never) && readSpendChain(item as never));
  return collapseDuplicates(open as never[]).map((raw) => {
    const item = raw as unknown as ApprovalLike;
    const chain = readSpendChain(item as never)!;
    const returned = Boolean(returnedToDepartment(item as never));
    const holder = chain.stage === "owner" && !returned ? "owner" : spendHolder(item as never) || "sultan";
    const stageSince = spendStageSince(item as never);
    const stageAgeHours = hoursBetween(stageSince, now);
    const overdue = spendOverdue(item as never, now);
    const ownerLate = chain.stage === "owner" && !returned && stageAgeHours >= SPEND_STAGE_SLA_HOURS;
    const createdAt = item.createdAt || stageSince;
    return {
      id: item.id,
      subject: chain.subject || item.title,
      amountSAR: Number(item.amount),
      stage: returned ? "returned" : chain.stage,
      holder,
      holderName: personName(holder),
      createdAt,
      ageHours: hoursBetween(createdAt, now),
      stageSince,
      stageAgeHours,
      slaHours: SPEND_STAGE_SLA_HOURS,
      stuck: Boolean(overdue) || ownerLate,
      overdueHours: overdue ? Math.max(0, overdue.hours - SPEND_STAGE_SLA_HOURS) : ownerLate ? stageAgeHours - SPEND_STAGE_SLA_HOURS : 0,
      returned,
      escalations: chain.escalation?.count || 0,
      lastEscalatedAt: chain.escalation?.at || null,
      projectId: linkedProjectId(item as never),
      fileHref: `/spend/${encodeURIComponent(item.id)}`,
      actionPath: holder === "owner" ? null : `/api/bridge/agents/${holder}/actions`,
    };
  }).sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.stageAgeHours - a.stageAgeHours);
}
