import { getSupabaseAdmin } from "../supabase";
import type { AuthUser } from "../auth";
import { approvalRoute, classifyRisk, type RiskClassificationInput } from "./governance";
import type { ExecutiveRole, RiskLevel } from "./types";

export type CompanyOperation =
  | "READ"
  | "CREATE_OPPORTUNITY"
  | "CREATE_DECISION"
  | "APPROVE_DECISION"
  | "RESERVE_BUDGET"
  | "EXECUTE_EXTERNAL_ACTION"
  | "RECONCILE_ACTION"
  | "PUBLISH_EVENT"
  | "ADMINISTER_POLICY";

export type PolicyInput = RiskClassificationInput & {
  tenantId: string;
  actor: AuthUser;
  operation: CompanyOperation;
  proposerId?: string;
  approvedRoles?: ExecutiveRole[];
  evidenceCount?: number;
};

export type PolicyDecision = {
  allowed: boolean;
  riskLevel: RiskLevel;
  requiredApprovals: ExecutiveRole[];
  missingApprovals: ExecutiveRole[];
  controls: string[];
  reasons: string[];
  policyVersion: string;
};

export const COMPANY_POLICY_VERSION = "2026-07-core-v1";

function actorExecutiveRole(actor: AuthUser): ExecutiveRole | null {
  switch (actor.role) {
    case "ADMIN":
      return "OWNER";
    case "CEO":
      return "CEO";
    case "CFO":
      return "CFO";
    default:
      return null;
  }
}

export function evaluateCompanyPolicy(input: PolicyInput): PolicyDecision {
  const riskLevel = classifyRisk(input);
  const requiredApprovals = approvalRoute(riskLevel);
  const approved = new Set(input.approvedRoles || []);
  const actorRole = actorExecutiveRole(input.actor);
  if (actorRole) approved.add(actorRole);

  const reasons: string[] = [];
  const controls = [
    "AUTHENTICATED_ACTOR",
    "TENANT_SCOPE",
    "AUDIT_TRAIL",
    "IDEMPOTENCY_KEY",
  ];

  if (!input.tenantId || input.actor.tenantId !== input.tenantId) {
    reasons.push("TENANT_MISMATCH");
  }

  if (input.proposerId && input.proposerId === input.actor.id && riskLevel !== "LOW" && input.operation === "APPROVE_DECISION") {
    reasons.push("SEPARATION_OF_DUTIES_REQUIRED");
  }

  if ((input.evidenceCount || 0) < 1 && ["CREATE_DECISION", "APPROVE_DECISION", "RESERVE_BUDGET"].includes(input.operation)) {
    reasons.push("EVIDENCE_REQUIRED");
  }

  if (riskLevel === "CRITICAL") controls.push("HUMAN_OWNER_APPROVAL", "DUAL_AUTHORIZATION", "NO_FULL_AUTOMATION");
  if (riskLevel === "HIGH") controls.push("INDEPENDENT_CHALLENGE", "ROLLBACK_PLAN", "POST_ACTION_REVIEW");
  if (["RESERVE_BUDGET", "EXECUTE_EXTERNAL_ACTION", "RECONCILE_ACTION"].includes(input.operation)) {
    controls.push("LEDGER_CONTROL", "EXTERNAL_RECEIPT", "RECONCILIATION");
  }

  const missingApprovals = requiredApprovals.filter((role) => !approved.has(role));
  if (missingApprovals.length > 0 && input.operation !== "CREATE_DECISION") {
    reasons.push("MISSING_REQUIRED_APPROVALS");
  }

  return {
    allowed: reasons.length === 0,
    riskLevel,
    requiredApprovals,
    missingApprovals,
    controls,
    reasons,
    policyVersion: COMPANY_POLICY_VERSION,
  };
}

export async function recordPolicyDecision(input: PolicyInput, decision: PolicyDecision, entity?: { type: string; id: string }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("policy_decisions").insert({
    tenant_id: input.tenantId,
    actor_id: input.actor.id,
    actor_role: input.actor.role,
    operation: input.operation,
    entity_type: entity?.type || null,
    entity_id: entity?.id || null,
    risk_level: decision.riskLevel,
    allowed: decision.allowed,
    required_approvals: decision.requiredApprovals,
    missing_approvals: decision.missingApprovals,
    controls: decision.controls,
    reasons: decision.reasons,
    policy_version: decision.policyVersion,
  });
}

export async function enforceCompanyPolicy(input: PolicyInput, entity?: { type: string; id: string }) {
  const decision = evaluateCompanyPolicy(input);
  await recordPolicyDecision(input, decision, entity).catch(() => undefined);
  if (!decision.allowed) {
    const error = new Error(`Policy denied: ${decision.reasons.join(", ")}`) as Error & { code?: string; decision?: PolicyDecision };
    error.code = "POLICY_DENIED";
    error.decision = decision;
    throw error;
  }
  return decision;
}
