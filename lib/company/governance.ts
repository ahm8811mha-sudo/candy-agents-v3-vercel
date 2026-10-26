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
    maxSAR: 0,
    approver: "صاحب الدور",
    approverAgentId: "department-head",
    label: "قرار تشغيلي بلا صرف",
    note: "يبقى داخل الدور ما دام بلا مبلغ",
  },
  {
    tier: "T2",
    maxSAR: 100_000,
    approver: "أحمد، رئيس مجلس الإدارة",
    approverAgentId: "owner",
    label: "اعتماد رئيس مجلس الإدارة",
    note: "بعد القسم ثم عبدالرحمن ثم حارس ثم توصية سلطان",
  },
  {
    tier: "T3",
    maxSAR: Number.POSITIVE_INFINITY,
    approver: "أحمد، رئيس مجلس الإدارة",
    approverAgentId: "owner",
    label: "اعتماد رئيس مجلس الإدارة",
    note: "كل مبلغ فوق 100,000 يمر بنفس السلسلة بلا استثناء",
  },
];

/** Any amount above 0 belongs to the Chairman. Zero is operational. Invalid amounts escalate. */
export function requiredTier(amountSAR: number): TierRule {
  if (!Number.isFinite(amountSAR) || amountSAR < 0) {
    return AUTHORITY_MATRIX[AUTHORITY_MATRIX.length - 1];
  }
  if (amountSAR === 0) return AUTHORITY_MATRIX[0];
  return AUTHORITY_MATRIX.find((rule) => amountSAR <= rule.maxSAR)!;
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

/**
 * The sign-off tier. A stored T0 or T1 label cannot keep a positive amount
 * inside an employee band. Zero-amount work stays operational unless a prior
 * high-risk escalation already stored T2 or T3.
 */
export function approvalTierForDecision(
  amountSAR: number | undefined,
  metadata?: Record<string, unknown>
): ApprovalTier {
  const amount = Number(amountSAR);
  if (Number.isFinite(amount) && amount > 0) return requiredTier(amount).tier;
  const persisted = String(metadata?.governanceTier || metadata?.tier || "");
  if (persisted === "T0" || persisted === "T2" || persisted === "T3") return persisted;
  return "T0";
}

/** No employee may approve a positive amount. The Chairman may. */
export function canSelfApprove(agentId: string, amountSAR: number): boolean {
  const agent = getAgent(agentId);
  if (!agent || !(amountSAR > 0)) return false;
  return agent.rank === "OWNER";
}

export function canRoleApprove(role: ServerApprovalRole, amountSAR: number): boolean {
  if (!Number.isFinite(amountSAR) || amountSAR < 0) return role === "OWNER";
  if (amountSAR === 0) return role === "OWNER" || role === "ADMIN" || role === "CEO" || role === "STAFF";
  return role === "OWNER" || role === "ADMIN";
}

export function assertCanApprove(role: ServerApprovalRole, amountSAR: number) {
  const tier = requiredTier(amountSAR);
  if (!canRoleApprove(role, amountSAR)) {
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
