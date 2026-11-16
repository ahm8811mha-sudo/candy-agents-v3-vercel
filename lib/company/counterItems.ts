/**
 * Counter drill-down: every number on the Chairman's screens carries the exact
 * list of records it counts, so a count and its list can never disagree.
 * Read-only. Built from the same records as the counters themselves.
 */
import { getAgent } from "./agents";
import { commandSla, type ChairmanCommand } from "./chairmanCommands";
import { readSpendChain, returnHolder, returnedExpiresAt, returnedToDepartment, spendStageAgent, spendStop } from "./spendChain";

export type CounterItemKind = "command" | "spend" | "returned" | "decision" | "task" | "project" | "idea";

export type CounterItem = {
  id: string;
  kind: CounterItemKind;
  title: string;
  amountSAR: number | null;
  /** Where the item sits now (step or chain stage). */
  stage: string;
  holderId: string | null;
  holderName: string;
  status: string;
  /** Why it is here: a stop note, a blocker, an SLA label. */
  reason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  dueAt: string | null;
  href: string;
  duplicateCount: number;
};

export function personName(id: string | null | undefined) {
  if (!id) return "";
  if (id === "owner") return "رئيس مجلس الإدارة";
  if (id === "department") return "القسم المعني";
  return getAgent(id)?.name || id;
}

const COMMAND_STATUS: Record<string, string> = { OPEN: "مفتوح", IN_PROGRESS: "قيد التنفيذ", BLOCKED: "متعطل", AWAITING_CHAIRMAN: "بانتظار قرارك", IN_SPEND_CHAIN: "في سلسلة الصرف", CLOSED: "مغلق" };
const STAGE: Record<string, string> = { department: "إعداد القسم", finance: "المراجعة المالية", governance: "الحوكمة", sultan: "توصية الرئيس التنفيذي", owner: "قرار رئيس المجلس", decided: "صدر القرار" };
const STOPPED_BY: Record<string, string> = { finance: "المالية (عبدالرحمن)", governance: "الحوكمة (حارس)", sultan: "الرئيس التنفيذي (سلطان)" };

export function commandItem(command: ChairmanCommand, now = new Date()): CounterItem {
  const pending = command.steps.find((step) => step.status !== "DONE");
  const holderId = command.status === "AWAITING_CHAIRMAN" ? "owner" : pending?.ownerAgentId || command.ownerAgentId;
  const sla = commandSla(command, now);
  const reasons = [...(command.blockers || []), ...(sla.overdue ? [sla.label] : [])];
  return {
    id: command.id,
    kind: "command",
    title: command.text,
    amountSAR: null,
    stage: command.status === "CLOSED" ? "مغلق" : command.currentStep || pending?.title || "لم تبدأ",
    holderId,
    holderName: personName(holderId),
    status: COMMAND_STATUS[command.status] || command.status,
    reason: reasons.length ? reasons.join(" · ") : null,
    createdAt: command.createdAt,
    updatedAt: command.closedAt || command.updatedAt,
    dueAt: command.status === "CLOSED" ? null : command.dueAt,
    href: `/commands#${command.id}`,
    duplicateCount: 1,
  };
}

type ApprovalRow = { id: string; title: string; amount?: number | null; status?: string; type?: string; createdAt?: string; created_at?: string; metadata?: Record<string, unknown> | null; duplicateCount?: number };

/** A spend request: where it is in the chain, who holds it, and why (a stop note when it was returned). */
export function spendItem(row: ApprovalRow): CounterItem {
  const chain = readSpendChain(row as never);
  const stopRaw = chain ? spendStop(chain) : null;
  const returned = returnedToDepartment(row as never);
  const holderId = returned ? returnHolder(row as never) : chain ? spendStageAgent(chain) : null;
  const createdAt = row.createdAt || row.created_at || null;
  const reviews = chain ? [chain.financeReview, chain.governanceReview, chain.sultanRecommendation].filter(Boolean).map((r) => r!.at).sort() : [];
  const stop = returned || stopRaw;
  if (!chain) {
    // Not a money request (e.g. a policy approval): it opens in the decision inbox.
    return {
      id: row.id, kind: "decision", title: row.title, amountSAR: row.amount == null ? null : Number(row.amount),
      stage: "بانتظار قرارك", holderId: "owner", holderName: personName("owner"), status: "بانتظار قرارك", reason: null,
      createdAt, updatedAt: createdAt, dueAt: null, href: `/inbox?decision=${encodeURIComponent(row.id)}`, duplicateCount: row.duplicateCount || 1,
    };
  }
  return {
    id: row.id,
    kind: returned ? "returned" : chain.stage === "owner" ? "decision" : "spend",
    title: chain.subject || row.title,
    amountSAR: row.amount == null ? chain.amountSAR : Number(row.amount),
    stage: stop ? `أُوقف عند ${STOPPED_BY[stop.by] || stop.by}` : STAGE[chain.stage] || chain.stage,
    holderId: holderId || null,
    holderName: personName(holderId),
    status: stop ? (returned ? returned.label : stop.label) : chain.stage === "owner" ? "بانتظار قرارك" : chain.stage === "department" ? "بانتظار مذكرة القسم" : "قيد المراجعة",
    reason: stop ? `${stop.reason}${stop.note ? `: ${stop.note}` : ""}` : chain.needsChainReview ? "يحتاج مراجعة السلسلة من البداية." : null,
    createdAt,
    updatedAt: reviews.at(-1) || createdAt,
    dueAt: returned ? returnedExpiresAt(returned, row as never) : null,
    // Only a complete memo opens in the decision inbox; anything else has its own read-only file.
    href: !stop && chain.stage === "owner" ? `/inbox?decision=${encodeURIComponent(row.id)}` : `/spend/${encodeURIComponent(row.id)}`,
    duplicateCount: row.duplicateCount || 1,
  };
}

const TASK_STATUS: Record<string, string> = { TODO: "لم تبدأ", OPEN: "مفتوحة", IN_PROGRESS: "قيد التنفيذ", REVIEW: "قيد المراجعة", BLOCKED: "متعطلة", WAITING_FUNDING: "بانتظار التمويل", ON_HOLD: "معلّقة", DONE: "منجزة", COMPLETED: "منجزة", CLOSED: "مغلقة" };
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function taskItem(row: Record<string, unknown>, holderId?: string | null): CounterItem {
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  const holder = holderId ?? (str(row.assigned_to ?? row.assignee_id ?? row.owner_agent_id ?? meta.assignedTo ?? meta.assignee ?? meta.ownerAgentId ?? meta.agentId) || null);
  const status = str(row.status).toUpperCase();
  const amount = row.amount ?? meta.amountSAR ?? null;
  return {
    id: str(row.id),
    kind: "task",
    title: str(row.title) || "مهمة بلا عنوان",
    amountSAR: amount == null || amount === "" ? null : Number(amount),
    stage: TASK_STATUS[status] || status || "—",
    holderId: holder,
    holderName: personName(holder) || "غير مسندة",
    status: TASK_STATUS[status] || status,
    reason: str(row.blocked_reason ?? meta.blockedReason ?? meta.reason) || null,
    createdAt: str(row.created_at) || null,
    updatedAt: str(row.completed_at || row.updated_at) || null,
    dueAt: str(row.due_date ?? row.due_at) || null,
    href: row.project_id ? `/projects?project=${encodeURIComponent(str(row.project_id))}` : "/operations",
    duplicateCount: 1,
  };
}

export function projectItem(row: { id: string; name: string; status?: string; budget?: number | null; created_at?: string; project_number?: number | null }): CounterItem {
  return {
    id: row.id, kind: "project", title: row.name, amountSAR: row.budget ?? null,
    stage: row.project_number ? `ملف ${row.project_number}` : "مشروع", holderId: null, holderName: "",
    status: row.status === "ACTIVE" ? "نشط" : row.status || "", reason: null,
    createdAt: row.created_at || null, updatedAt: null, dueAt: null,
    href: `/projects?project=${encodeURIComponent(row.id)}`, duplicateCount: 1,
  };
}

const IDEA_STATUS: Record<string, string> = { UNDER_STUDY: "قيد الدراسة", PENDING_APPROVAL: "جاهزة للقرار", APPROVED: "معتمدة", REJECTED: "مرفوضة" };

export function ideaItem(idea: { id: string; title: string; budgetSAR?: number; status: string; proposedBy?: string; proposedByName?: string; createdAt: string; executedProjectId?: string; aggregate?: { summary?: string } }): CounterItem {
  return {
    id: idea.id, kind: "idea", title: idea.title, amountSAR: idea.budgetSAR ?? null,
    stage: idea.executedProjectId ? "مرتبطة بمشروع" : IDEA_STATUS[idea.status] || idea.status,
    holderId: idea.proposedBy || null, holderName: idea.proposedByName || personName(idea.proposedBy),
    status: IDEA_STATUS[idea.status] || idea.status, reason: idea.aggregate?.summary ? idea.aggregate.summary.slice(0, 240) : null,
    createdAt: idea.createdAt, updatedAt: null, dueAt: null,
    href: idea.executedProjectId ? `/projects?project=${encodeURIComponent(idea.executedProjectId)}` : `/ideas?idea=${encodeURIComponent(idea.id)}`,
    duplicateCount: 1,
  };
}
