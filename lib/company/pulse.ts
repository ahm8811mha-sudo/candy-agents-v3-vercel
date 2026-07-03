/**
 * Company pulse — the live heartbeat (OPERATING_MODEL.md §10).
 *
 * Honesty rule: presence indicators are DERIVED from real system events
 * (ideas submitted, department studies, sultan summaries, governance gating,
 * owner sign-offs, review actions) — never decorative. If an agent shows
 * "يعمل الآن" it is because a real record exists behind it.
 */

import { COMPANY_AGENTS, getAgent, type CompanyAgent } from "./agents";
import { listIdeas } from "./ideas";
import { listApprovals } from "../approvals";
import { listDecisions } from "../decisions";

export type PulseKind = "IDEA" | "STUDY" | "SUMMARY" | "GATE" | "SIGNOFF" | "REVIEW";

export type PulseEvent = {
  id: string;
  agentId: string;
  agentName: string;
  kind: PulseKind;
  kindLabel: string;
  title: string;
  createdAt: string;
};

export type Presence = "WORKING" | "TODAY" | "IDLE";

export type AgentPresence = CompanyAgent & {
  presence: Presence;
  presenceLabel: string;
  lastAction?: string;
  lastActivityAt?: string;
};

const WORKING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const reviewLabel: Record<string, string> = {
  APPROVED: "اعتمد",
  REJECTED: "رفض",
  NOTED: "علّق على",
  FORWARDED: "أحال",
};

function push(events: PulseEvent[], e: Omit<PulseEvent, "id">) {
  events.push({ ...e, id: `${e.kind}-${e.agentId}-${e.createdAt}-${events.length}` });
}

export function getCompanyPulse(now: Date = new Date()): {
  events: PulseEvent[];
  agents: AgentPresence[];
  workingCount: number;
} {
  const events: PulseEvent[] = [];

  // ── ideas pipeline events ──
  for (const idea of listIdeas()) {
    const proposer = idea.proposedBy === "owner" ? null : getAgent(idea.proposedBy);
    push(events, {
      agentId: idea.proposedBy,
      agentName: proposer ? proposer.name : "المالك",
      kind: "IDEA",
      kindLabel: "فكرة",
      title: `قدّم فكرة: ${idea.title}`,
      createdAt: idea.createdAt,
    });

    for (const rec of idea.recommendations) {
      push(events, {
        agentId: rec.agentId,
        agentName: rec.agentName,
        kind: "STUDY",
        kindLabel: "دراسة",
        title: `درس «${idea.title}» — ${rec.verdict === "APPROVE" ? "يُوصى" : rec.verdict === "REJECT" ? "لا يُوصى" : "بتحفظ"} بثقة ${(rec.confidence * 100).toFixed(0)}%`,
        createdAt: rec.createdAt,
      });
    }

    if (idea.aggregate) {
      push(events, {
        agentId: "sultan",
        agentName: "سلطان",
        kind: "SUMMARY",
        kindLabel: "خلاصة",
        title: `أصدر خلاصة «${idea.title}»`,
        createdAt: idea.createdAt,
      });
    }

    if (idea.approvalId) {
      push(events, {
        agentId: "hares",
        agentName: "حارس",
        kind: "GATE",
        kindLabel: "حوكمة",
        title: `رفع «${idea.title}» لمركز القرار (فئة ${idea.tier})`,
        createdAt: idea.createdAt,
      });
    }
  }

  // ── owner sign-offs on approvals ──
  for (const approval of listApprovals()) {
    if (!approval.decidedAt) continue;
    push(events, {
      agentId: "owner",
      agentName: "المالك",
      kind: "SIGNOFF",
      kindLabel: "اعتماد",
      title: `${approval.status === "APPROVED" ? "اعتمد" : "رفض"}: ${approval.title}`,
      createdAt: approval.decidedAt,
    });
  }

  // ── review actions (notes / forwards on company items) ──
  for (const decision of listDecisions()) {
    push(events, {
      agentId: "owner",
      agentName: "المالك",
      kind: "REVIEW",
      kindLabel: "مراجعة",
      title: `${reviewLabel[decision.action] || decision.action}: ${decision.title}${decision.forwardedTo ? ` ← ${decision.forwardedTo}` : ""}`,
      createdAt: decision.createdAt,
    });
  }

  events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const trimmed = events.slice(0, 60);

  // ── presence derived from the latest real event per agent ──
  const lastByAgent = new Map<string, PulseEvent>();
  for (const e of events) {
    if (!lastByAgent.has(e.agentId)) lastByAgent.set(e.agentId, e);
  }

  const agents: AgentPresence[] = COMPANY_AGENTS.map((agent) => {
    const last = lastByAgent.get(agent.id);
    let presence: Presence = "IDLE";
    if (last) {
      const age = now.getTime() - new Date(last.createdAt).getTime();
      presence = age <= WORKING_WINDOW_MS ? "WORKING" : age <= TODAY_WINDOW_MS ? "TODAY" : "IDLE";
    }
    return {
      ...agent,
      presence,
      presenceLabel: presence === "WORKING" ? "يعمل الآن" : presence === "TODAY" ? "نشط اليوم" : "خامل",
      lastAction: last?.title,
      lastActivityAt: last?.createdAt,
    };
  });

  return {
    events: trimmed,
    agents,
    workingCount: agents.filter((a) => a.presence === "WORKING").length,
  };
}
