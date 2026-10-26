import { listApprovals } from "../approvals";
import { listChairmanCommands, publicCommandStatus } from "./chairmanCommands";
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
  }>;
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
  const alerts: ChairmanDigest["alerts"] = [];
  for (const item of listApprovals()) {
    const chain = readSpendChain(item);
    if (chain?.governanceReview?.result === "موقوف") {
      alerts.push({
        id: `gov-${item.id}`,
        severity: "critical",
        title: `حارس أوقف طلباً مالياً: ${item.title}`,
        at: chain.governanceReview.at || item.createdAt,
      });
    }
  }
  for (const command of listChairmanCommands()) {
    if (command.blockers.some((blocker) => /حوكمة|خطر|موقوف/.test(blocker))) {
      alerts.push({
        id: `cmd-${command.id}`,
        severity: "critical",
        title: `عائق حوكمة على أمر: ${command.text.slice(0, 80)}`,
        at: command.updatedAt,
      });
    }
  }
  const recentAlerts = alerts.filter((alert) => changedSince(alert.at, sinceMs));
  return { ok: true, since, generatedAt: now.toISOString(), memos, returned, commands, alerts: recentAlerts };
}

export function memoTextForApproval(id: string) {
  const item = listApprovals().find((approval) => approval.id === id);
  if (!item) return null;
  const chain = readSpendChain(item);
  if (!chain || !isOwnerReadySpend(chain)) return null;
  return formatDecisionMemo(toDecisionMemo(item.id, chain));
}
