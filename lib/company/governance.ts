/**
 * Financial authority matrix (docs/OPERATING_MODEL.md §5).
 *
 * Every SAR amount maps to exactly one approval tier. Pure functions — the
 * governance rules are fully unit-testable and shared by the UI and the
 * approval flow, so what the org chart says is what the system enforces.
 */

import { getAgent } from "./agents";

export type ApprovalTier = "T0" | "T1" | "T2" | "T3";
export type ServerApprovalRole = "OWNER" | "ADMIN" | "CEO" | "STAFF";

export type TierRule = {
  tier: ApprovalTier;
  /** inclusive upper bound in SAR (Infinity for the top tier) */
  maxSAR: number;
  approver: string;
  approverAgentId: string;
  label: string;
  note: string;
};

export const AUTHORITY_MATRIX: TierRule[] = [
  {
    tier: "T0",
    maxSAR: 5_000,
    approver: "رئيس القسم",
    approverAgentId: "department-head",
    label: "تنفيذ ذاتي",
    note: "يُسجَّل قيداً محاسبياً وفي سجل التدقيق",
  },
  {
    tier: "T1",
    maxSAR: 25_000,
    approver: "سلطان — الرئيس التنفيذي",
    approverAgentId: "sultan",
    label: "اعتماد CEO Agent",
    note: "يظهر للمالك للاطلاع",
  },
  {
    tier: "T2",
    maxSAR: 100_000,
    approver: "المالك",
    approverAgentId: "owner",
    label: "اعتماد المالك",
    note: "بند إلزامي في مركز القرار",
  },
  {
    tier: "T3",
    maxSAR: Number.POSITIVE_INFINITY,
    approver: "المالك + جدوى ثلاثية",
    approverAgentId: "owner",
    label: "اعتماد المالك مع دراسة جدوى موقعة من 3 أقسام",
    note: "لا استثناءات",
  },
];

/** The rule governing a given amount (amounts ≤ 0 are invalid → top tier). */
export function requiredTier(amountSAR: number): TierRule {
  if (!Number.isFinite(amountSAR) || amountSAR <= 0) {
    return AUTHORITY_MATRIX[AUTHORITY_MATRIX.length - 1];
  }
  return AUTHORITY_MATRIX.find((r) => amountSAR <= r.maxSAR)!;
}

/**
 * The effective approval tier combines financial exposure with operational
 * risk. HIGH/CRITICAL actions can never remain in the self-execution or CEO
 * tiers: they require the owner (T2) even when the amount is small.
 */
export function effectiveTier(amountSAR: number, riskLevel?: string): TierRule {
  const financialTier = requiredTier(amountSAR);
  const normalizedRisk = String(riskLevel || "LOW").toUpperCase();
  if (!["HIGH", "CRITICAL"].includes(normalizedRisk)) return financialTier;
  const ownerTier = AUTHORITY_MATRIX.find((rule) => rule.tier === "T2")!;
  return ["T0", "T1"].includes(financialTier.tier) ? ownerTier : financialTier;
}

/** Resolve the persisted tier used by the sign-off API. */
export function approvalTierForDecision(
  amountSAR: number | undefined,
  metadata?: Record<string, unknown>
): ApprovalTier {
  const persisted = String(metadata?.governanceTier || metadata?.tier || "");
  if (["T0", "T1", "T2", "T3"].includes(persisted)) return persisted as ApprovalTier;
  return amountSAR ? requiredTier(amountSAR).tier : "T1";
}

/** May this agent spend this amount without escalation? (T0 gate) */
export function canSelfApprove(agentId: string, amountSAR: number): boolean {
  const agent = getAgent(agentId);
  if (!agent || amountSAR <= 0) return false;
  const tier = requiredTier(amountSAR);
  if (agent.rank === "OWNER") return true;
  if (agent.rank === "CEO") return tier.tier === "T0" || tier.tier === "T1";
  return tier.tier === "T0" && amountSAR <= agent.authorityLimitSAR;
}

export function canRoleApprove(role: ServerApprovalRole, amountSAR: number, feasibilityConfirmed = false): boolean {
  const tier = requiredTier(amountSAR).tier;
  if (role === "OWNER") return tier !== "T3" || feasibilityConfirmed;
  if (tier === "T0") return role === "ADMIN" || role === "CEO";
  if (tier === "T1") return role === "ADMIN" || role === "CEO";
  return false;
}

export function assertCanApprove(role: ServerApprovalRole, amountSAR: number, feasibilityConfirmed = false) {
  const tier = requiredTier(amountSAR);
  if (!canRoleApprove(role, amountSAR, feasibilityConfirmed)) {
    if (tier.tier === "T3" && role === "OWNER" && !feasibilityConfirmed) {
      throw new Error("يتطلب هذا القرار دراسة جدوى ثلاثية قبل اعتماد المالك.");
    }
    throw new Error(`لا يملك هذا المستخدم صلاحية اعتماد ${tier.tier}. المطلوب: ${tier.approver}.`);
  }
  return tier;
}

/** True when the amount must reach the owner's decision inbox. */
export function requiresOwner(amountSAR: number): boolean {
  const t = requiredTier(amountSAR).tier;
  return t === "T2" || t === "T3";
}

/** True when a signed three-department feasibility study is mandatory. */
export function requiresFeasibility(amountSAR: number): boolean {
  return requiredTier(amountSAR).tier === "T3";
}
