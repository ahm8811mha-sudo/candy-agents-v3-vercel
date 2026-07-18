export const OWNER_ABSENCE_POLICY_VERSION = "2026-07-owner-continuity-v1";

export type OwnerAbsenceStatus = "INACTIVE" | "SCHEDULED" | "ACTIVE" | "PAUSED";
export type OwnerAbsenceEffectiveStatus = OwnerAbsenceStatus | "EXPIRED";
export type AutonomousRiskLevel = "LOW" | "MEDIUM";

export type OwnerAbsencePolicy = {
  id?: string;
  tenantId: string;
  status: OwnerAbsenceStatus;
  effectiveStatus: OwnerAbsenceEffectiveStatus;
  startsAt: string | null;
  endsAt: string | null;
  strategicGuidance: string;
  prohibitedActions: string[];
  routineAutoLimitSAR: number;
  executiveAgentLimitSAR: number;
  maxAutonomousRisk: AutonomousRiskLevel;
  allowExternalActions: boolean;
  requireCompletionEvidence: boolean;
  delegatedHumanName: string | null;
  delegatedHumanContact: string | null;
  dailyBriefHour: number;
  lastRunAt: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  policyVersion: string;
};

export type AbsenceAuthorityOutcome =
  | "NORMAL_OPERATION"
  | "AUTONOMOUS_EXECUTION"
  | "EXECUTIVE_AGENT_REVIEW"
  | "DEFER_TO_OWNER"
  | "PAUSED";

export type AbsenceAuthorityDecision = {
  allowed: boolean;
  outcome: AbsenceAuthorityOutcome;
  reasons: string[];
  controls: string[];
  policyVersion: string;
};

export type AbsenceAuthorityInput = {
  actionType?: string | null;
  executionMode?: string | null;
  provider?: string | null;
  amountSAR?: number | null;
  riskLevel?: string | null;
  requiresApproval?: boolean | null;
  approvalStatus?: string | null;
  external?: boolean;
  strategic?: boolean;
};

export const DEFAULT_PROHIBITED_OWNER_ABSENCE_ACTIONS = [
  "STRATEGY_CHANGE",
  "LEGAL_COMMITMENT",
  "BANK_TRANSFER",
  "BORROWING",
  "BUDGET_GATE",
  "CAPITAL_ALLOCATION",
  "NEW_MARKET_ENTRY",
  "HIRING",
  "TERMINATION",
  "OWNERSHIP_CHANGE",
] as const;

export function defaultOwnerAbsencePolicy(tenantId: string): OwnerAbsencePolicy {
  return {
    tenantId,
    status: "INACTIVE",
    effectiveStatus: "INACTIVE",
    startsAt: null,
    endsAt: null,
    strategicGuidance:
      "يحافظ الوكلاء على التشغيل القائم ضمن الميزانيات المعتمدة. يعود للمالك فقط تغيير الاستراتيجية أو الالتزام القانوني أو المالي الجوهري.",
    prohibitedActions: [...DEFAULT_PROHIBITED_OWNER_ABSENCE_ACTIONS],
    routineAutoLimitSAR: 5_000,
    executiveAgentLimitSAR: 25_000,
    maxAutonomousRisk: "MEDIUM",
    allowExternalActions: false,
    requireCompletionEvidence: true,
    delegatedHumanName: null,
    delegatedHumanContact: null,
    dailyBriefHour: 18,
    lastRunAt: null,
    policyVersion: OWNER_ABSENCE_POLICY_VERSION,
  };
}

function validTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function effectiveOwnerAbsenceStatus(
  policy: Pick<OwnerAbsencePolicy, "status" | "startsAt" | "endsAt">,
  now = Date.now()
): OwnerAbsenceEffectiveStatus {
  if (policy.status === "INACTIVE" || policy.status === "PAUSED") return policy.status;
  const startsAt = validTimestamp(policy.startsAt);
  const endsAt = validTimestamp(policy.endsAt);
  if (startsAt !== null && now < startsAt) return "SCHEDULED";
  if (endsAt !== null && now >= endsAt) return "EXPIRED";
  return "ACTIVE";
}

function riskRank(value: string | null | undefined) {
  const normalized = String(value || "LOW").toUpperCase();
  if (normalized === "CRITICAL") return 4;
  if (normalized === "HIGH") return 3;
  if (normalized === "MEDIUM") return 2;
  return 1;
}

function normalizedAction(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function isApproved(input: AbsenceAuthorityInput) {
  if (!input.requiresApproval) return true;
  return ["APPROVED", "NOT_REQUIRED"].includes(normalizedAction(input.approvalStatus));
}

export function evaluateOwnerAbsenceAuthority(
  policy: OwnerAbsencePolicy,
  input: AbsenceAuthorityInput,
  now = Date.now()
): AbsenceAuthorityDecision {
  const effectiveStatus = effectiveOwnerAbsenceStatus(policy, now);
  const controls = ["TENANT_SCOPE", "AUDIT_TRAIL", "IDEMPOTENCY", "EVIDENCE_ON_COMPLETION"];

  if (effectiveStatus === "INACTIVE" || effectiveStatus === "SCHEDULED" || effectiveStatus === "EXPIRED") {
    return {
      allowed: true,
      outcome: "NORMAL_OPERATION",
      reasons: effectiveStatus === "EXPIRED" ? ["OWNER_ABSENCE_WINDOW_EXPIRED"] : [],
      controls,
      policyVersion: policy.policyVersion,
    };
  }

  if (effectiveStatus === "PAUSED") {
    return {
      allowed: false,
      outcome: "PAUSED",
      reasons: ["OWNER_ABSENCE_MODE_PAUSED"],
      controls: [...controls, "NO_AUTONOMOUS_EXECUTION"],
      policyVersion: policy.policyVersion,
    };
  }

  const reasons: string[] = [];
  const actionType = normalizedAction(input.actionType);
  const amountSAR = Math.max(0, Number(input.amountSAR || 0));
  const external = input.external === true
    || normalizedAction(input.executionMode) !== "INTERNAL"
    || !["", "INTERNAL", "ORVANTA_AGENTS", "ORVANTA-RULES"].includes(normalizedAction(input.provider));

  if (!isApproved(input)) reasons.push("APPROVAL_NOT_GRANTED");
  const prohibited = policy.prohibitedActions
    .map(normalizedAction)
    .some((item) => actionType === item || (item.length > 4 && actionType.includes(item)));
  if (input.strategic || prohibited) {
    reasons.push("OWNER_STRATEGIC_AUTHORITY_REQUIRED");
  }
  if (riskRank(input.riskLevel) > riskRank(policy.maxAutonomousRisk)) {
    reasons.push("RISK_EXCEEDS_AUTONOMOUS_LIMIT");
  }
  if (external && !policy.allowExternalActions) reasons.push("EXTERNAL_ACTIONS_DISABLED_DURING_ABSENCE");
  if (amountSAR > policy.executiveAgentLimitSAR) reasons.push("COMMITMENT_EXCEEDS_EXECUTIVE_AGENT_LIMIT");

  if (reasons.length > 0) {
    return {
      allowed: false,
      outcome: "DEFER_TO_OWNER",
      reasons,
      controls: [...controls, "PRESERVE_CURRENT_STATE", "OWNER_INBOX_ESCALATION"],
      policyVersion: policy.policyVersion,
    };
  }

  if (amountSAR <= policy.routineAutoLimitSAR && !external) {
    return {
      allowed: true,
      outcome: "AUTONOMOUS_EXECUTION",
      reasons: ["WITHIN_ROUTINE_AUTHORITY"],
      controls: [...controls, "ROUTINE_BUDGET_LIMIT"],
      policyVersion: policy.policyVersion,
    };
  }

  return {
    allowed: true,
    outcome: "EXECUTIVE_AGENT_REVIEW",
    reasons: ["WITHIN_EXECUTIVE_AGENT_AUTHORITY"],
    controls: [...controls, "CEO_AGENT_REVIEW", "POST_ACTION_OWNER_VISIBILITY"],
    policyVersion: policy.policyVersion,
  };
}

export function hasCompletionEvidence(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  return Object.keys(result as Record<string, unknown>).length > 0;
}
