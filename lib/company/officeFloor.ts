/**
 * Live office floor: a read-only snapshot of every employee, derived only from
 * real records (chairman commands, spend-chain approvals, tasks, pulse events).
 * Nothing here is invented: an employee with no open work is shown as idle.
 */
import { COMPANY_AGENTS } from "./agents";
import { listChairmanCommands, type ChairmanCommand } from "./chairmanCommands";
import { listApprovals } from "../approvals";
import { getCompanyPulse } from "./pulse";
import { approvalVisibleToChairman, collapseDuplicates, isMonetarySpend, readSpendChain, returnHolder, returnedToDepartment, spendStageAgent, spendStop } from "./spendChain";
import { buildDecisionDesk } from "./decisionDesk";

export type OfficeStatus = "working" | "waiting" | "blocked" | "idle";
export type OfficeTaskRow = Record<string, unknown>;
export type OfficeItem = { id: string; kind: "command" | "step" | "spend" | "task" | "decision" | "returned"; title: string; status: string; amountSAR?: number | null; at?: string | null };

const OPEN_TASK = new Set(["TODO", "OPEN", "IN_PROGRESS", "REVIEW", "BLOCKED", "WAITING_FUNDING", "ON_HOLD"]);
const BLOCKED_TASK = new Set(["BLOCKED", "WAITING_FUNDING", "ON_HOLD"]);
const DONE_TASK = new Set(["DONE", "COMPLETED", "CLOSED"]);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function taskAssignee(row: OfficeTaskRow): string {
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  return str(row.assigned_to ?? row.assignee_id ?? row.owner_agent_id ?? meta.assignedTo ?? meta.assignee ?? meta.ownerAgentId ?? meta.agentId);
}
const commandStatusLabel: Record<string, string> = { OPEN: "مفتوح", IN_PROGRESS: "قيد التنفيذ", BLOCKED: "متعطل", AWAITING_CHAIRMAN: "بانتظار قرارك", IN_SPEND_CHAIN: "في سلسلة الصرف", CLOSED: "مغلق" };
const stageLabel: Record<string, string> = { department: "إعداد القسم", finance: "المراجعة المالية", governance: "الحوكمة", sultan: "توصية الرئيس التنفيذي", owner: "قرار رئيس المجلس" };

function isToday(iso: string | null | undefined, now: Date) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.toDateString() === now.toDateString();
}

export function buildOfficeFloor({ tasks, tasksAvailable, now = new Date() }: { tasks: OfficeTaskRow[]; tasksAvailable: boolean; now?: Date }) {
  const commands = listChairmanCommands();
  const approvals = listApprovals();
  const pulse = getCompanyPulse(now);
  const pulseByAgent = new Map(pulse.agents.map((a) => [a.id, a]));

  // Spend requests in flight: where each one sits right now, and the path it walks.
  const flows = approvals.filter((a) => isMonetarySpend(a.amount) && (a.status === "PENDING" || a.status === "DEFERRED")).flatMap((a) => {
    const chain = readSpendChain(a);
    if (!chain) return [];
    const stopped = spendStop(chain);
    const stage = spendStageAgent(chain);
    const holder = stopped ? returnHolder(a) : stage;
    if (!holder) return [];
    const from = chain.preparingAgentId && chain.preparingAgentId !== "department" ? chain.preparingAgentId : "sultan";
    return [{ id: a.id, title: a.title, amount: a.amount ?? null, amountSAR: a.amount ?? null, stage: chain.stage, stageLabel: stopped ? stopped.label : stageLabel[chain.stage] || chain.stage, holder, path: [from, "abdulrahman", "hares", "sultan", "owner"], stopped: Boolean(stopped), at: a.createdAt }];
  });
  const uniqueFlows = collapseDuplicates(flows.map((f) => ({ ...f, status: "PENDING" })));
  const desk = buildDecisionDesk(now);
  const weekAgo = now.getTime() - 7 * 24 * 3_600_000;

  const employees = COMPANY_AGENTS.map((agent) => {
    const mine = commands.filter((c) => c.ownerAgentId === agent.id || c.collaborators.includes(agent.id) || c.steps.some((s) => s.ownerAgentId === agent.id));
    const openCmds = mine.filter((c) => c.status !== "CLOSED");
    const myTasks = tasks.filter((t) => taskAssignee(t) === agent.id);
    const openTasks = myTasks.filter((t) => OPEN_TASK.has(str(t.status).toUpperCase()));
    const holding = agent.id === "owner"
      ? collapseDuplicates(approvals.filter((a) => (a.status === "PENDING" || a.status === "DEFERRED") && approvalVisibleToChairman(a)))
      : uniqueFlows.filter((f) => f.holder === agent.id && !f.stopped);
    const pendingStep = (c: ChairmanCommand) => c.steps.find((s) => s.ownerAgentId === agent.id && s.status === "PENDING");

    // Items Hares or finance stopped are visible to the department that must fix them (G4).
    const returnedHere = uniqueFlows.filter((f) => f.holder === agent.id && f.stopped);
    const queue: OfficeItem[] = [
      ...returnedHere.map((f) => ({ id: f.id, kind: "returned" as const, title: f.title + ((f.duplicateCount || 1) > 1 ? ` (×${f.duplicateCount})` : ""), status: `أُعيد للتصحيح: ${f.stageLabel}`, amountSAR: f.amountSAR, at: f.at })),
      ...openCmds.map((c) => ({ id: c.id, kind: "command" as const, title: pendingStep(c)?.title || c.text, status: commandStatusLabel[c.status] || c.status, at: c.updatedAt })),
      ...holding.map((h) => ({ id: h.id, kind: agent.id === "owner" ? "decision" as const : "spend" as const, title: h.title + ((h.duplicateCount || 1) > 1 ? ` (×${h.duplicateCount})` : ""), status: agent.id === "owner" ? "بانتظار قرارك" : `مراجعة: ${"stageLabel" in h ? h.stageLabel : ""}`, amountSAR: h.amount ?? null, at: ("createdAt" in h ? h.createdAt : "at" in h ? h.at : null) as string | null })),
      ...openTasks.map((t) => ({ id: str(t.id), kind: "task" as const, title: str(t.title), status: str(t.status), at: str(t.updated_at) || null })),
    ];
    const completed: OfficeItem[] = [
      ...mine.filter((c) => c.status === "CLOSED").map((c) => ({ id: c.id, kind: "command" as const, title: c.text, status: "مغلق", at: c.closedAt || c.updatedAt })),
      ...myTasks.filter((t) => DONE_TASK.has(str(t.status).toUpperCase())).map((t) => ({ id: str(t.id), kind: "task" as const, title: str(t.title), status: "منجز", at: str(t.completed_at || t.updated_at) || null })),
    ].sort((a, b) => str(b.at).localeCompare(str(a.at))).slice(0, 8);

    const overdueMine = openCmds.filter((c) => c.ownerAgentId === agent.id && Date.parse(c.dueAt) < now.getTime()).length;
    const doneWeek = mine.filter((c) => c.status === "CLOSED" && Date.parse(c.closedAt || c.updatedAt) >= weekAgo).length
      + myTasks.filter((t) => DONE_TASK.has(str(t.status).toUpperCase()) && Date.parse(str(t.completed_at || t.updated_at)) >= weekAgo).length;
    const blocked = returnedHere.length > 0 || openCmds.some((c) => c.status === "BLOCKED" || pendingStep(c) === undefined && c.steps.some((s) => s.ownerAgentId === agent.id && s.status === "BLOCKED")) || openTasks.some((t) => BLOCKED_TASK.has(str(t.status).toUpperCase()));
    const active = openCmds.some((c) => (c.status === "IN_PROGRESS" || c.status === "OPEN") && (c.ownerAgentId === agent.id || pendingStep(c))) || openTasks.some((t) => str(t.status).toUpperCase() === "IN_PROGRESS") || (agent.id !== "owner" && holding.length > 0);
    const waiting = openCmds.some((c) => c.status === "AWAITING_CHAIRMAN" || c.status === "IN_SPEND_CHAIN") || (agent.id === "owner" && holding.length > 0);
    const presence = pulseByAgent.get(agent.id);
    const status: OfficeStatus = blocked ? "blocked" : active ? "working" : waiting ? "waiting" : presence?.presence === "WORKING" ? "working" : "idle";
    const current = queue.find((q) => q.kind !== "task") || queue.find((q) => q.status.toUpperCase() === "IN_PROGRESS") || queue[0] || null;
    const timeline = pulse.events.filter((e) => e.agentId === agent.id).slice(0, 12).map((e) => ({ id: e.id, title: e.title, kind: e.kindLabel, at: e.createdAt }));
    const lastActivityAt = [presence?.lastActivityAt, ...queue.map((q) => q.at), ...completed.map((c) => c.at)].filter(Boolean).sort().pop() || null;
    return {
      id: agent.id, name: agent.name, title: agent.title, department: agent.department, rank: agent.rank, reportsTo: agent.reportsTo, sector: agent.sector,
      kpis: { open: queue.length, overdue: overdueMine, doneWeek, returned: returnedHere.length },
      status, current, queue, completed, timeline, lastActivityAt,
      chain: uniqueFlows.filter((f) => f.path.includes(agent.id)).slice(0, 12).map((f) => ({ id: f.id, title: f.title, amountSAR: f.amountSAR, stageLabel: f.stageLabel, holder: f.holder, stopped: f.stopped })),
    };
  });

  const openCommands = commands.filter((c) => c.status !== "CLOSED");
  const chairmanReady = collapseDuplicates(approvals.filter((a) => (a.status === "PENDING" || a.status === "DEFERRED") && isMonetarySpend(a.amount) && approvalVisibleToChairman(a))).length;
  const returned = collapseDuplicates(approvals.filter((a) => returnedToDepartment(a))).length;
  const returnedList = desk.returned;
  const overdue = openCommands.filter((c) => Date.parse(c.dueAt) < now.getTime()).length;
  return {
    asOf: now.toISOString(),
    tasksAvailable,
    counters: {
      openCommands: openCommands.length,
      inProgress: openCommands.filter((c) => c.status === "IN_PROGRESS").length + tasks.filter((t) => str(t.status).toUpperCase() === "IN_PROGRESS").length,
      awaitingChairman: chairmanReady + openCommands.filter((c) => c.status === "AWAITING_CHAIRMAN").length,
      completedToday: commands.filter((c) => c.status === "CLOSED" && isToday(c.closedAt, now)).length + tasks.filter((t) => isToday(str(t.completed_at) || null, now)).length,
      alerts: openCommands.filter((c) => c.status === "BLOCKED").length + overdue + tasks.filter((t) => BLOCKED_TASK.has(str(t.status).toUpperCase())).length,
      returned,
    },
    employees,
    desk: { cards: desk.cards.length, waiting: desk.waiting, digestAt: desk.digestAt },
    returned: returnedList.map((r) => ({ id: r.id, title: r.subject, amountSAR: r.amountSAR, holder: r.holder, holderName: r.holderName, reason: r.reason, note: r.note, expiresAt: r.expiresAt, count: r.duplicateCount })),
    flows: uniqueFlows.filter((f) => !f.stopped).map((f) => ({ id: f.id, title: f.title, amountSAR: f.amountSAR, holder: f.holder, path: f.path, stageLabel: f.stageLabel, count: f.duplicateCount })),
  };
}
