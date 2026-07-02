/**
 * Self-improvement loop (OPERATING_MODEL.md §9).
 *
 * The company learns from its own decision record: it compares the studies'
 * verdicts against the owner's actual sign-offs, measures how well each
 * department's recommendations align with what the owner approves, and adapts
 * a confidence threshold — the bar an idea's aggregate confidence must clear
 * before it is worth the owner's attention. All deterministic from the record,
 * so it is testable and never fabricated.
 */

import { listIdeas, type Idea, type Verdict } from "./ideas";
import { listApprovals } from "../approvals";
import { COMPANY_AGENTS } from "./agents";

const BASE_THRESHOLD = 0.6;
const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 0.8;

export type AgentAccuracy = {
  agentId: string;
  agentName: string;
  studied: number;
  aligned: number; // times the agent's verdict matched the owner's outcome
  accuracy: number; // 0..1 (0.5 baseline when no data)
};

export type LearningSnapshot = {
  decisionsAnalyzed: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  /** adaptive confidence bar for surfacing ideas */
  confidenceThreshold: number;
  agentAccuracy: AgentAccuracy[];
  recommendation: string;
};

type Outcome = "APPROVED" | "REJECTED";

/** Did this agent's verdict agree with the final owner outcome? */
function verdictAgrees(verdict: Verdict, outcome: Outcome): boolean {
  if (outcome === "APPROVED") return verdict === "APPROVE" || verdict === "CONDITIONAL";
  return verdict === "REJECT";
}

function outcomeOf(idea: Idea, approvalsById: Map<string, string>): Outcome | null {
  if (idea.status === "APPROVED") return "APPROVED";
  if (idea.status === "REJECTED") return "REJECTED";
  if (idea.approvalId) {
    const st = approvalsById.get(idea.approvalId);
    if (st === "APPROVED") return "APPROVED";
    if (st === "REJECTED") return "REJECTED";
  }
  return null;
}

export function getLearningSnapshot(): LearningSnapshot {
  const ideas = listIdeas();
  const approvalsById = new Map(listApprovals().map((a) => [a.id, a.status]));

  // Only decided ideas teach us anything.
  const decided = ideas
    .map((idea) => ({ idea, outcome: outcomeOf(idea, approvalsById) }))
    .filter((x): x is { idea: Idea; outcome: Outcome } => x.outcome !== null);

  const approved = decided.filter((d) => d.outcome === "APPROVED").length;
  const rejected = decided.length - approved;
  const approvalRate = decided.length ? approved / decided.length : 0;

  // Per-agent alignment with owner outcomes.
  const acc = new Map<string, { studied: number; aligned: number }>();
  for (const { idea, outcome } of decided) {
    for (const rec of idea.recommendations) {
      const cur = acc.get(rec.agentId) || { studied: 0, aligned: 0 };
      cur.studied += 1;
      if (verdictAgrees(rec.verdict, outcome)) cur.aligned += 1;
      acc.set(rec.agentId, cur);
    }
  }

  const agentAccuracy: AgentAccuracy[] = COMPANY_AGENTS.filter((a) => acc.has(a.id)).map((a) => {
    const rec = acc.get(a.id)!;
    return {
      agentId: a.id,
      agentName: a.name,
      studied: rec.studied,
      aligned: rec.aligned,
      accuracy: rec.studied ? rec.aligned / rec.studied : 0.5,
    };
  });

  // Adapt the threshold: if the owner rejects a lot, raise the bar (surface
  // fewer, stronger ideas); if the owner approves most, relax it slightly.
  let threshold = BASE_THRESHOLD;
  if (decided.length >= 3) {
    if (approvalRate < 0.4) threshold = BASE_THRESHOLD + 0.12;
    else if (approvalRate > 0.75) threshold = BASE_THRESHOLD - 0.08;
  }
  threshold = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(threshold * 100) / 100));

  const recommendation = !decided.length
    ? "لا قرارات مكتملة بعد — ستبدأ الشركة بالتعلّم بمجرد اعتماد أو رفض أول فكرة."
    : approvalRate < 0.4
      ? `نسبة الاعتماد منخفضة (${Math.round(approvalRate * 100)}%). رُفع حد الثقة إلى ${Math.round(threshold * 100)}% لعرض أفكار أقوى فقط.`
      : approvalRate > 0.75
        ? `نسبة الاعتماد مرتفعة (${Math.round(approvalRate * 100)}%). خُفّض الحد إلى ${Math.round(threshold * 100)}% لعرض فرص أكثر.`
        : `الأداء متوازن (اعتماد ${Math.round(approvalRate * 100)}%). حد الثقة مستقر عند ${Math.round(threshold * 100)}%.`;

  return {
    decisionsAnalyzed: decided.length,
    approved,
    rejected,
    approvalRate,
    confidenceThreshold: threshold,
    agentAccuracy,
    recommendation,
  };
}
