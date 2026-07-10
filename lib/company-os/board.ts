import { approvalRoute } from "./governance";
import type { DecisionPacket, ExecutiveRole, RiskLevel } from "./types";

export type BoardMeetingType = "DAILY_OPERATIONS" | "WEEKLY_EXECUTIVE" | "MONTHLY_CAPITAL" | "INCIDENT";

export type BoardAgendaItem = {
  id: string;
  title: string;
  riskLevel: RiskLevel;
  financialImpactSAR: number;
  ownerRole: ExecutiveRole;
  evidenceCount: number;
  overdue: boolean;
};

export const BOARD_CADENCE = {
  DAILY_OPERATIONS: {
    purpose: "إدارة الاستثناءات وSLA والفشل والمخاطر النقدية والعملاء المتأثرين.",
    mandatoryInputs: ["failed workflows", "overdue decisions", "cash anomalies", "critical customer issues"],
  },
  WEEKLY_EXECUTIVE: {
    purpose: "مراجعة الأهداف والمالية والقدرة والمخاطر وتحديد أولويات الأسبوع.",
    mandatoryInputs: ["objective progress", "financial performance", "capacity", "risk register", "capital requests"],
  },
  MONTHLY_CAPITAL: {
    purpose: "إعادة تخصيص رأس المال وفق العائد والمخاطر وتكلفة الفرصة البديلة.",
    mandatoryInputs: ["capital consumed", "actual outcomes", "revised forecasts", "portfolio alternatives"],
  },
  INCIDENT: {
    purpose: "احتواء حدث حرج وتحديد الصلاحيات والتواصل والسبب الجذري.",
    mandatoryInputs: ["incident facts", "affected entities", "containment status", "continuity impact"],
  },
} as const;

export function prioritizeBoardAgenda(items: BoardAgendaItem[]) {
  const riskWeight: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 3, HIGH: 7, CRITICAL: 12 };
  return [...items].sort((a, b) => {
    const aScore = riskWeight[a.riskLevel] * 100 + (a.overdue ? 75 : 0) + Math.log10(Math.max(a.financialImpactSAR, 1)) * 10;
    const bScore = riskWeight[b.riskLevel] * 100 + (b.overdue ? 75 : 0) + Math.log10(Math.max(b.financialImpactSAR, 1)) * 10;
    return bScore - aScore;
  });
}

export function buildDecisionPacket(input: {
  tenantId: string;
  title: string;
  recommendation: string;
  facts: string[];
  assumptions: string[];
  options: DecisionPacket["options"];
  financialImpactSAR: number;
  riskLevel: RiskLevel;
  successCriteria: string[];
  killCriteria: string[];
  dissentingView?: string;
  reviewAt: string;
  objectiveId?: string;
  opportunityId?: string;
  projectId?: string;
}): DecisionPacket {
  if (input.facts.length === 0) throw new Error("A board decision requires at least one fact.");
  if (input.options.length < 2 && input.riskLevel !== "LOW") {
    throw new Error("Material decisions require at least two considered options.");
  }
  if (input.successCriteria.length === 0 || input.killCriteria.length === 0) {
    throw new Error("Every decision requires success and kill criteria.");
  }

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    title: input.title,
    objectiveId: input.objectiveId,
    opportunityId: input.opportunityId,
    projectId: input.projectId,
    recommendation: input.recommendation,
    facts: input.facts,
    assumptions: input.assumptions,
    options: input.options,
    financialImpactSAR: input.financialImpactSAR,
    riskLevel: input.riskLevel,
    dissentingView: input.dissentingView,
    requiredApprovals: approvalRoute(input.riskLevel),
    successCriteria: input.successCriteria,
    killCriteria: input.killCriteria,
    reviewAt: input.reviewAt,
    createdAt: new Date().toISOString(),
  };
}

export const DISAGREEMENT_PROTOCOL = [
  "محرك المجال يقدم التوصية والأدلة.",
  "CRO يولد challenge case مستقلاً.",
  "CFO يولد downside financial scenario.",
  "مراجع مستقل أو نموذج ثانٍ يتحقق من المنطق والأدلة.",
  "CEO يلخص نقاط الاتفاق والخلاف دون إخفاء الرأي المعارض.",
  "الخلاف غير المحسوم في قرار HIGH أو CRITICAL يصعد للمالك.",
];
