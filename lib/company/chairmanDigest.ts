import { listApprovals } from "../approvals";
import { listChairmanCommands, publicCommandStatus } from "./chairmanCommands";
import { buildDecisionDesk, type DecisionDesk } from "./decisionDesk";
import {
  approvalVisibleToChairman,
  collapseDuplicates,
  returnedToDepartment,
  formatDecisionMemo,
  isMonetarySpend,
  isOwnerReadySpend,
  readSpendChain,
  toDecisionMemo,
} from "./spendChain";

export type ChairmanDigest = {
  ok: true;
  since: string;
  generatedAt: string;
  memos: Array<{
    id: string;
    subject: string;
    amountSAR: number;
    sultanRecommendation: string;
    approvePath: string;
    duplicateCount: number;
    duplicateIds: string[];
  }>;
  returned: Array<{ id: string; subject: string; amountSAR: number; stoppedBy: string; note: string; label: string; duplicateCount: number }>;
  commands: Array<{
    id: string;
    subject: string;
    status: string;
    ownerAgentId: string;
    currentStep: string;
    updatedAt: string;
  }>;
  alerts: Array<{
    id: string;
    severity: "critical";
    title: string;
    at: string;
    /** Similar alerts are merged into one (G8). */
    count?: number;
  }>;
  /** The decision desk: at most seven cards with Sultan's recommendation (additive field). */
  decisionCards: DecisionDesk["cards"];
  /** Every overdue command, whatever changed since the last poll (G9). */
  overdue: DecisionDesk["overdue"];
  desk: { digestAt: string; counts: DecisionDesk["counts"] };
};

function changedSince(updatedAt: string, sinceMs: number) {
  const at = Date.parse(updatedAt);
  return Number.isFinite(at) && at >= sinceMs;
}

export function buildChairmanDigest(since: string, now = new Date()): ChairmanDigest {
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs)) throw new Error("since يجب أن يكون تاريخاً بصيغة ISO.");
  const pending = listApprovals().filter((item) => item.status === "PENDING" || item.status === "DEFERRED");
  const memos = collapseDuplicates(pending.filter((item) => approvalVisibleToChairman(item) && isMonetarySpend(item.amount))).map((item) => {
    const chain = readSpendChain(item)!;
    const memo = toDecisionMemo(item.id, chain);
    return {
      id: item.id,
      subject: memo.subject,
      amountSAR: memo.amountSAR,
      sultanRecommendation: memo.sultanRecommendation,
      approvePath: `/inbox?decision=${encodeURIComponent(item.id)}`,
      duplicateCount: item.duplicateCount,
      duplicateIds: item.duplicateIds,
    };
  });
  const returned = collapseDuplicates(pending.filter((item) => returnedToDepartment(item))).map((item) => {
    const stop = returnedToDepartment(item)!;
    return { id: item.id, subject: item.title, amountSAR: Number(item.amount), stoppedBy: stop.by, note: stop.note, label: stop.label, duplicateCount: item.duplicateCount };
  });
  const commands = listChairmanCommands().filter((command) => {
    const overdue = command.status !== "CLOSED" && Date.parse(command.dueAt) < now.getTime();
    const active = command.status === "CLOSED" || command.status === "BLOCKED" || command.status === "AWAITING_CHAIRMAN" || command.status === "IN_SPEND_CHAIN";
    // `commands` keeps its "changed since" contract for the polling routine;
    // every overdue command is always listed in `overdue` below (G9).
    if (overdue && (changedSince(command.dueAt, sinceMs) || changedSince(command.updatedAt, sinceMs))) return true;
    return active && changedSince(command.updatedAt, sinceMs);
  }).map((command) => {
    const status = publicCommandStatus(command);
    return {
      id: status.id,
      subject: status.subject,
      status: status.status,
      ownerAgentId: status.ownerAgentId,
      currentStep: status.currentStep,
      updatedAt: status.updatedAt,
    };
  });
  // Similar alerts are merged: one alert per kind, with a count (G8).
  const stops = listApprovals().filter((item) => readSpendChain(item)?.governanceReview?.result === "موقوف")
    .map((item) => ({ item, at: readSpendChain(item)!.governanceReview!.at || item.createdAt }));
  const alerts: ChairmanDigest["alerts"] = [];
  const recentStops = stops.filter((stop) => changedSince(stop.at, sinceMs));
  if (recentStops.length) {
    const latest = recentStops.map((stop) => stop.at).sort().pop()!;
    alerts.push({
      id: recentStops.length === 1 ? `gov-${recentStops[0].item.id}` : "gov-stops",
      severity: "critical",
      title: recentStops.length === 1 ? `حارس أوقف طلباً مالياً: ${recentStops[0].item.title}` : `حارس أوقف ${recentStops.length} طلبات مالية وأعادها لأقسامها`,
      at: latest,
      count: recentStops.length,
    });
  }
  const governanceBlocked = listChairmanCommands().filter((command) => command.blockers.some((blocker) => /حوكمة|خطر|موقوف/.test(blocker)) && changedSince(command.updatedAt, sinceMs));
  for (const command of governanceBlocked) {
    alerts.push({ id: `cmd-${command.id}`, severity: "critical", title: `عائق حوكمة على أمر: ${command.text.slice(0, 80)}`, at: command.updatedAt, count: 1 });
  }
  const desk = buildDecisionDesk(now);
  return { ok: true, since, generatedAt: now.toISOString(), memos, returned, commands, alerts, decisionCards: desk.cards, overdue: desk.overdue, desk: { digestAt: desk.digestAt, counts: desk.counts } };
}

export function memoTextForApproval(id: string) {
  const item = listApprovals().find((approval) => approval.id === id);
  if (!item) return null;
  const chain = readSpendChain(item);
  if (!chain || !isOwnerReadySpend(chain)) return null;
  return formatDecisionMemo(toDecisionMemo(item.id, chain));
}
