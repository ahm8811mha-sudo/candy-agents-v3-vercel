import { getSupabaseAdmin } from "../supabase";
import { normalizeTenantId } from "../tenant";
import {
  OWNER_ABSENCE_POLICY_VERSION,
  defaultOwnerAbsencePolicy,
  effectiveOwnerAbsenceStatus,
  evaluateOwnerAbsenceAuthority,
  hasCompletionEvidence,
  type AbsenceAuthorityDecision,
  type OwnerAbsencePolicy,
  type OwnerAbsenceStatus,
} from "./ownerAbsencePolicy";

type PolicyRow = Record<string, unknown>;

export type OwnerAbsencePolicyUpdate = {
  status: OwnerAbsenceStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  strategicGuidance: string;
  prohibitedActions?: string[];
  routineAutoLimitSAR: number;
  executiveAgentLimitSAR: number;
  maxAutonomousRisk: "LOW" | "MEDIUM";
  allowExternalActions: boolean;
  requireCompletionEvidence: boolean;
  delegatedHumanName?: string | null;
  delegatedHumanContact?: string | null;
  dailyBriefHour: number;
  updatedBy: string;
};

export type AbsenceActionRecord = {
  id: string;
  project_id?: string | null;
  action_type?: string | null;
  execution_mode?: string | null;
  provider?: string | null;
  requires_approval?: boolean | null;
  approval_status?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};

export type AbsenceApprovalRecord = {
  id: string;
  type?: string | null;
  amount?: number | null;
  requestedRole?: string | null;
  metadata?: Record<string, unknown> | null;
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : fallback;
}

function mapPolicyRow(row: PolicyRow, tenantId: string): OwnerAbsencePolicy {
  const fallback = defaultOwnerAbsencePolicy(tenantId);
  const status = String(row.status || fallback.status) as OwnerAbsenceStatus;
  const policy: OwnerAbsencePolicy = {
    id: stringOrNull(row.id) || undefined,
    tenantId,
    status,
    effectiveStatus: status,
    startsAt: stringOrNull(row.starts_at),
    endsAt: stringOrNull(row.ends_at),
    strategicGuidance: String(row.strategic_guidance || fallback.strategicGuidance),
    prohibitedActions: stringArray(row.prohibited_actions, fallback.prohibitedActions),
    routineAutoLimitSAR: numberValue(row.routine_auto_limit_sar, fallback.routineAutoLimitSAR),
    executiveAgentLimitSAR: numberValue(row.executive_agent_limit_sar, fallback.executiveAgentLimitSAR),
    maxAutonomousRisk: String(row.max_autonomous_risk || fallback.maxAutonomousRisk) === "LOW" ? "LOW" : "MEDIUM",
    allowExternalActions: row.allow_external_actions === true,
    requireCompletionEvidence: row.require_completion_evidence !== false,
    delegatedHumanName: stringOrNull(row.delegated_human_name),
    delegatedHumanContact: stringOrNull(row.delegated_human_contact),
    dailyBriefHour: numberValue(row.daily_brief_hour, fallback.dailyBriefHour),
    lastRunAt: stringOrNull(row.last_run_at),
    updatedBy: stringOrNull(row.updated_by),
    updatedAt: stringOrNull(row.updated_at),
    policyVersion: OWNER_ABSENCE_POLICY_VERSION,
  };
  return { ...policy, effectiveStatus: effectiveOwnerAbsenceStatus(policy) };
}

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || String(error?.message || "").includes("owner_absence_policies");
}

export async function getOwnerAbsencePolicy(tenantId: string): Promise<OwnerAbsencePolicy> {
  const tenant = normalizeTenantId(tenantId);
  const supabase = getSupabaseAdmin();
  if (!supabase) return defaultOwnerAbsencePolicy(tenant);

  const { data, error } = await supabase
    .from("owner_absence_policies")
    .select("*")
    .eq("tenant_id", tenant)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return defaultOwnerAbsencePolicy(tenant);
    throw new Error(`Unable to load owner absence policy: ${error.message}`);
  }
  return data ? mapPolicyRow(data as PolicyRow, tenant) : defaultOwnerAbsencePolicy(tenant);
}

export async function saveOwnerAbsencePolicy(tenantId: string, input: OwnerAbsencePolicyUpdate) {
  const tenant = normalizeTenantId(tenantId);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required to save the owner absence policy.");
  const strategicGuidance = input.strategicGuidance.trim();
  if (["ACTIVE", "SCHEDULED"].includes(input.status) && strategicGuidance.length < 20) {
    throw new Error("أضف توجيهًا استراتيجيًا واضحًا قبل تفعيل غياب المالك.");
  }
  if (input.status === "SCHEDULED" && !input.startsAt) {
    throw new Error("حدد وقت بداية الغياب قبل جدولة طبقة الاستمرارية.");
  }
  if (input.routineAutoLimitSAR < 0 || input.executiveAgentLimitSAR < input.routineAutoLimitSAR) {
    throw new Error("يجب أن يكون حد وكيل CEO مساويًا أو أعلى من حد التنفيذ الروتيني.");
  }
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new Error("تاريخ نهاية الغياب يجب أن يكون بعد تاريخ البداية.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("owner_absence_policies")
    .upsert({
      tenant_id: tenant,
      status: input.status,
      starts_at: input.startsAt || null,
      ends_at: input.endsAt || null,
      strategic_guidance: strategicGuidance,
      prohibited_actions: input.prohibitedActions,
      routine_auto_limit_sar: input.routineAutoLimitSAR,
      executive_agent_limit_sar: input.executiveAgentLimitSAR,
      max_autonomous_risk: input.maxAutonomousRisk,
      allow_external_actions: input.allowExternalActions,
      require_completion_evidence: input.requireCompletionEvidence,
      delegated_human_name: input.delegatedHumanName || null,
      delegated_human_contact: input.delegatedHumanContact || null,
      daily_brief_hour: input.dailyBriefHour,
      updated_by: input.updatedBy,
      updated_at: now,
    }, { onConflict: "tenant_id" })
    .select("*")
    .single();
  if (error) throw new Error(`Unable to save owner absence policy: ${error.message}`);

  const policy = mapPolicyRow(data as PolicyRow, tenant);
  await recordContinuityEvent({
    tenantId: tenant,
    policyId: policy.id,
    eventType: "OWNER_ABSENCE_POLICY_UPDATED",
    decision: policy.effectiveStatus,
    reason: `Policy updated by ${input.updatedBy}`,
    evidence: {
      status: policy.status,
      startsAt: policy.startsAt,
      endsAt: policy.endsAt,
      routineAutoLimitSAR: policy.routineAutoLimitSAR,
      executiveAgentLimitSAR: policy.executiveAgentLimitSAR,
      allowExternalActions: policy.allowExternalActions,
      policyVersion: policy.policyVersion,
    },
  }).catch(() => undefined);
  return policy;
}

function payloadRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function actionCommitment(payload: Record<string, unknown>) {
  const records = [payload, payloadRecord(payload.integration), payloadRecord(payload.financialImpact)];
  let maximum = 0;
  for (const record of records) {
    for (const key of ["commitmentSAR", "amountSAR", "expectedAmountSAR", "requestedBudget", "plannedBudget"]) {
      const value = Number(record[key]);
      if (Number.isFinite(value) && value > maximum) maximum = value;
    }
  }
  return maximum;
}

export async function authorizeActionDuringOwnerAbsence(
  action: AbsenceActionRecord,
  tenantId?: string
): Promise<{ policy: OwnerAbsencePolicy; decision: AbsenceAuthorityDecision }> {
  const tenant = normalizeTenantId(tenantId);
  const policy = await getOwnerAbsencePolicy(tenant);
  const payload = payloadRecord(action.payload);
  const decision = evaluateOwnerAbsenceAuthority(policy, {
    actionType: action.action_type,
    executionMode: action.execution_mode,
    provider: action.provider,
    amountSAR: actionCommitment(payload),
    riskLevel: String(payload.riskLevel || "LOW"),
    requiresApproval: action.requires_approval,
    approvalStatus: action.approval_status,
    strategic: payload.strategic === true
      || payload.legalCommitment === true
      || payload.regulatoryAction === true
      || payload.ownershipChange === true,
  });

  if (policy.effectiveStatus === "ACTIVE") {
    await recordContinuityEvent({
      tenantId: tenant,
      policyId: policy.id,
      eventType: decision.allowed ? "AUTONOMOUS_ACTION_AUTHORIZED" : "ACTION_DEFERRED_TO_OWNER",
      projectId: action.project_id,
      actionId: action.id,
      decision: decision.outcome,
      reason: decision.reasons.join(", "),
      evidence: { controls: decision.controls, actionType: action.action_type, policyVersion: decision.policyVersion },
    }).catch(() => undefined);
  }
  return { policy, decision };
}

export async function assertActionAllowedDuringOwnerAbsence(action: AbsenceActionRecord, tenantId?: string) {
  const authorization = await authorizeActionDuringOwnerAbsence(action, tenantId);
  if (!authorization.decision.allowed) {
    const error = new Error(
      `Owner absence policy deferred this action: ${authorization.decision.reasons.join(", ")}`
    ) as Error & { code?: string; decision?: AbsenceAuthorityDecision };
    error.code = "OWNER_ABSENCE_ESCALATION";
    error.decision = authorization.decision;
    throw error;
  }
  return authorization;
}

const EXTERNAL_APPROVAL_TYPES = new Set([
  "TRADE",
  "INCOME",
  "SALES_CHANGE",
  "GOVERNMENT_RENEWAL",
  "BANK_TRANSFER",
]);

export async function assertApprovalDecisionAllowedDuringOwnerAbsence(input: {
  tenantId?: string;
  approval: AbsenceApprovalRecord;
  actorRole?: string | null;
  decision: "APPROVED" | "REJECTED";
}) {
  const tenant = normalizeTenantId(input.tenantId);
  const policy = await getOwnerAbsencePolicy(tenant);
  if (policy.effectiveStatus !== "ACTIVE") return { policy, decision: null };

  const actorRole = String(input.actorRole || "").toUpperCase();
  const metadata = payloadRecord(input.approval.metadata);
  const actionType = String(metadata.actionKind || metadata.decisionType || input.approval.type || "APPROVAL");

  // A rejection preserves the current state. The authenticated owner can
  // still intervene during the absence window and thereby provide fresh
  // strategic direction; every such intervention is recorded.
  if (input.decision === "REJECTED" || actorRole === "OWNER") {
    await recordContinuityEvent({
      tenantId: tenant,
      policyId: policy.id,
      eventType: input.decision === "REJECTED" ? "APPROVAL_REJECTED_DURING_ABSENCE" : "OWNER_STRATEGIC_OVERRIDE",
      approvalId: input.approval.id,
      decision: input.decision === "REJECTED" ? "PRESERVE_CURRENT_STATE" : "OWNER_DIRECTION_RECORDED",
      reason: input.decision === "REJECTED" ? "The approval was rejected without creating a new commitment." : `Owner authority exercised by ${actorRole}.`,
      evidence: { actionType, amountSAR: Number(input.approval.amount || 0), policyVersion: policy.policyVersion },
    }).catch(() => undefined);
    return { policy, decision: null };
  }

  const external = metadata.external === true || EXTERNAL_APPROVAL_TYPES.has(actionType.toUpperCase());
  const authority = evaluateOwnerAbsenceAuthority(policy, {
    actionType,
    executionMode: external ? "EXTERNAL" : "INTERNAL",
    provider: external ? "approval_transition" : "internal",
    amountSAR: Number(input.approval.amount || metadata.requestedBudget || metadata.amountSAR || 0),
    riskLevel: String(metadata.riskLevel || "LOW"),
    requiresApproval: false,
    approvalStatus: "APPROVED",
    external,
    strategic: metadata.strategic === true
      || metadata.legalCommitment === true
      || metadata.regulatoryAction === true,
  });

  await recordContinuityEvent({
    tenantId: tenant,
    policyId: policy.id,
    eventType: authority.allowed ? "EXECUTIVE_APPROVAL_AUTHORIZED" : "APPROVAL_DEFERRED_TO_OWNER",
    approvalId: input.approval.id,
    decision: authority.outcome,
    reason: authority.reasons.join(", "),
    evidence: { actionType, actorRole, controls: authority.controls, policyVersion: authority.policyVersion },
  }).catch(() => undefined);

  if (!authority.allowed) {
    const error = new Error(
      `Owner absence policy deferred this approval: ${authority.reasons.join(", ")}`
    ) as Error & { code?: string; decision?: AbsenceAuthorityDecision };
    error.code = "OWNER_ABSENCE_ESCALATION";
    error.decision = authority;
    throw error;
  }

  return { policy, decision: authority };
}

export async function assertCompletionEvidenceDuringOwnerAbsence(
  tenantId: string | undefined,
  result: unknown
) {
  const policy = await getOwnerAbsencePolicy(normalizeTenantId(tenantId));
  if (policy.effectiveStatus === "ACTIVE" && policy.requireCompletionEvidence && !hasCompletionEvidence(result)) {
    const error = new Error("لا يمكن إغلاق المهمة أثناء غياب المالك دون دليل أو نتيجة محفوظة.") as Error & { code?: string };
    error.code = "COMPLETION_EVIDENCE_REQUIRED";
    throw error;
  }
}

export async function recordContinuityEvent(input: {
  tenantId: string;
  policyId?: string | null;
  eventType: string;
  projectId?: string | null;
  actionId?: string | null;
  approvalId?: string | null;
  decision: string;
  reason?: string | null;
  evidence?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from("company_continuity_events").insert({
    tenant_id: normalizeTenantId(input.tenantId),
    policy_id: input.policyId || null,
    event_type: input.eventType,
    project_id: input.projectId || null,
    action_id: input.actionId || null,
    approval_id: input.approvalId || null,
    decision: input.decision,
    reason: input.reason || null,
    evidence: input.evidence || {},
  });
  if (error && !isMissingTable(error)) throw new Error(`Unable to record continuity event: ${error.message}`);
}

export async function recordOwnerAbsenceSweep(input: {
  tenantId: string;
  agentProjectsSelected: number;
  agentProjectsCompleted: number;
  failedAgentActions: number;
}) {
  const tenant = normalizeTenantId(input.tenantId);
  const policy = await getOwnerAbsencePolicy(tenant);
  if (policy.effectiveStatus !== "ACTIVE") {
    return { active: false, policy, overdueTasks: 0, pendingApprovals: 0 };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return { active: true, policy, overdueTasks: 0, pendingApprovals: 0 };

  const [overdue, approvals] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant)
      .not("status", "in", "(DONE,COMPLETED,CANCELLED)")
      .lt("due_date", new Date().toISOString()),
    supabase
      .from("company_approvals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant)
      .eq("status", "PENDING"),
  ]);
  if (overdue.error) throw new Error(`Unable to count overdue continuity work: ${overdue.error.message}`);
  if (approvals.error) throw new Error(`Unable to count continuity approvals: ${approvals.error.message}`);

  const now = new Date().toISOString();
  await supabase
    .from("owner_absence_policies")
    .update({ last_run_at: now, updated_at: now })
    .eq("tenant_id", tenant);
  await recordContinuityEvent({
    tenantId: tenant,
    policyId: policy.id,
    eventType: "OWNER_ABSENCE_SWEEP_COMPLETED",
    decision: input.failedAgentActions > 0 ? "EXECUTION_ATTENTION" : "OPERATIONS_CONTINUING",
    reason: input.failedAgentActions > 0 ? "One or more agent actions require recovery." : "Autonomous operations remained inside the owner charter.",
    evidence: {
      agentProjectsSelected: input.agentProjectsSelected,
      agentProjectsCompleted: input.agentProjectsCompleted,
      failedAgentActions: input.failedAgentActions,
      overdueTasks: overdue.count || 0,
      pendingApprovals: approvals.count || 0,
      strategicGuidance: policy.strategicGuidance,
    },
  });
  return {
    active: true,
    policy: { ...policy, lastRunAt: now },
    overdueTasks: overdue.count || 0,
    pendingApprovals: approvals.count || 0,
  };
}

export async function listContinuityEvents(tenantId: string, limit = 20) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("company_continuity_events")
    .select("id,event_type,project_id,action_id,approval_id,decision,reason,evidence,created_at")
    .eq("tenant_id", normalizeTenantId(tenantId))
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`Unable to load continuity events: ${error.message}`);
  }
  return data || [];
}
