import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import { isPersonalOwnerMode } from "../auth";
import { buildDecisionPacket } from "./board";
import { canReserveBudget } from "./finance";
import { classifyRisk } from "./governance";
import { createCompanyEvent, eventToOutboxRecord } from "./events";
import { appendCompanyEvent } from "./outboxPublisher";
import type { ExecutiveRole, RiskLevel } from "./types";

export type WorkflowStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "RETRY"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type WorkflowStepStatus = "PENDING" | "RUNNING" | "WAITING_APPROVAL" | "RETRY" | "COMPLETED" | "FAILED" | "SKIPPED";

export type IdeaToInvestmentInput = {
  title: string;
  recommendation: string;
  facts: string[];
  assumptions?: string[];
  options: Array<{ label: string; benefits: string[]; risks: string[] }>;
  financialImpactSAR: number;
  approvedBudgetSAR: number;
  commitmentSAR?: number;
  customerFacing?: boolean;
  legalCommitment?: boolean;
  regulatoryAction?: boolean;
  sensitiveData?: boolean;
  securityImpact?: boolean;
  irreversible?: boolean;
  affectsManyCustomers?: boolean;
  threatensContinuity?: boolean;
  successCriteria: string[];
  killCriteria: string[];
  dissentingView?: string;
  reviewAt: string;
  objectiveId?: string;
  opportunityId?: string;
  actions?: Array<{ actionType: string; title: string; description?: string; provider?: string; payload?: Record<string, unknown> }>;
};

export type StartWorkflowInput = {
  tenantId: string;
  actorId: string;
  correlationId?: string;
  input: IdeaToInvestmentInput;
};

export const IDEA_TO_INVESTMENT_WORKFLOW = {
  id: "idea-to-investment",
  version: 1,
  steps: [
    "VALIDATE_INPUT",
    "CLASSIFY_RISK",
    "CREATE_DECISION_PACKET",
    "WAIT_FOR_APPROVAL",
    "RESERVE_BUDGET",
    "CREATE_PROJECT",
    "DISPATCH_ACTIONS",
    "FINALIZE",
  ] as const,
};

type RuntimeRow = {
  id: string;
  tenant_id: string;
  workflow_id: string;
  workflow_version: number;
  entity_type: string;
  entity_id: string;
  correlation_id: string;
  status: WorkflowStatus;
  current_step?: string | null;
  input: IdeaToInvestmentInput;
  output?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  created_at: string;
};

type StepRow = {
  id: string;
  tenant_id: string;
  workflow_instance_id: string;
  step_key: typeof IDEA_TO_INVESTMENT_WORKFLOW.steps[number];
  step_order: number;
  status: WorkflowStepStatus;
  attempt: number;
  idempotency_key: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  available_at: string;
};

export function isWorkflowRuntimeEnabled() {
  return isPersonalOwnerMode()
    ? process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED !== "false"
    : process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED === "true";
}

function requireRuntime() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for durable workflow execution.");
  if (!isWorkflowRuntimeEnabled()) {
    throw new Error("Durable workflow runtime is disabled. Set ORVANTA_WORKFLOW_RUNTIME_ENABLED=true after applying the core schema.");
  }
  return supabase;
}

function validateInput(input: IdeaToInvestmentInput) {
  const errors: string[] = [];
  if (!input.title?.trim()) errors.push("TITLE_REQUIRED");
  if (!input.recommendation?.trim()) errors.push("RECOMMENDATION_REQUIRED");
  if (!Array.isArray(input.facts) || input.facts.length === 0) errors.push("FACTS_REQUIRED");
  if (!Array.isArray(input.options) || input.options.length === 0) errors.push("OPTIONS_REQUIRED");
  if (!Array.isArray(input.successCriteria) || input.successCriteria.length === 0) errors.push("SUCCESS_CRITERIA_REQUIRED");
  if (!Array.isArray(input.killCriteria) || input.killCriteria.length === 0) errors.push("KILL_CRITERIA_REQUIRED");
  if (!input.reviewAt || Number.isNaN(Date.parse(input.reviewAt))) errors.push("VALID_REVIEW_DATE_REQUIRED");
  if (!Number.isFinite(input.financialImpactSAR) || input.financialImpactSAR < 0) errors.push("INVALID_FINANCIAL_IMPACT");
  if (!Number.isFinite(input.approvedBudgetSAR) || input.approvedBudgetSAR < 0) errors.push("INVALID_APPROVED_BUDGET");
  if (errors.length) throw new Error(`Workflow input invalid: ${errors.join(", ")}`);
}

export async function startIdeaToInvestmentWorkflow(args: StartWorkflowInput) {
  validateInput(args.input);
  const supabase = requireRuntime();
  const correlationId = args.correlationId || randomUUID();
  const instanceId = randomUUID();
  const now = new Date().toISOString();

  const instance: RuntimeRow = {
    id: instanceId,
    tenant_id: args.tenantId,
    workflow_id: IDEA_TO_INVESTMENT_WORKFLOW.id,
    workflow_version: IDEA_TO_INVESTMENT_WORKFLOW.version,
    entity_type: "opportunity",
    entity_id: args.input.opportunityId || correlationId,
    correlation_id: correlationId,
    status: "PENDING",
    current_step: IDEA_TO_INVESTMENT_WORKFLOW.steps[0],
    input: args.input,
    output: { actorId: args.actorId },
    created_at: now,
  };

  const steps = IDEA_TO_INVESTMENT_WORKFLOW.steps.map((step, index) => ({
    id: randomUUID(),
    tenant_id: args.tenantId,
    workflow_instance_id: instanceId,
    step_key: step,
    step_order: index + 1,
    status: index === 0 ? "PENDING" : "PENDING",
    attempt: 0,
    idempotency_key: `${args.tenantId}:${correlationId}:${step}:v1`,
    input: {},
    available_at: now,
  }));
  const event = createCompanyEvent({
    type: "workflow.started",
    tenantId: args.tenantId,
    actorId: args.actorId,
    actorType: "HUMAN",
    entityType: "workflow",
    entityId: instanceId,
    correlationId,
    payload: { workflowId: IDEA_TO_INVESTMENT_WORKFLOW.id, title: args.input.title },
  });
  const outbox = eventToOutboxRecord(event);
  const { data, error } = await supabase.rpc("orvanta_start_workflow_bundle", {
    p_instance: instance,
    p_steps: steps,
    p_event: {
      id: event.id,
      tenant_id: event.tenantId,
      event_type: event.type,
      event_version: event.version,
      actor_id: event.actorId,
      actor_type: event.actorType,
      entity_type: event.entityType,
      entity_id: event.entityId,
      correlation_id: event.correlationId,
      causation_id: event.causationId || null,
      payload: event.payload,
      occurred_at: event.occurredAt,
    },
    p_outbox: outbox,
  });
  if (error) throw new Error(`Atomic workflow start failed: ${error.message}`);
  const result = data as { instance?: RuntimeRow; reused?: boolean } | null;
  return { instance: result?.instance || instance, reused: Boolean(result?.reused) };
}

async function requiredApprovalsSatisfied(tenantId: string, decisionId: string, required: ExecutiveRole[]) {
  if (required.length === 0) return true;
  const supabase = requireRuntime();
  const { data, error } = await supabase
    .from("decision_approvals")
    .select("required_role,status")
    .eq("tenant_id", tenantId)
    .eq("decision_id", decisionId);
  if (error) throw error;
  const approved = new Set((data || []).filter((item) => item.status === "APPROVED").map((item) => item.required_role));
  return required.every((role) => approved.has(role));
}

async function executeStep(instance: RuntimeRow, step: StepRow): Promise<{ output: Record<string, unknown>; waiting?: boolean }> {
  const supabase = requireRuntime();
  const input = instance.input;
  const prior = instance.output || {};

  switch (step.step_key) {
    case "VALIDATE_INPUT":
      validateInput(input);
      return { output: { validatedAt: new Date().toISOString() } };

    case "CLASSIFY_RISK": {
      const riskLevel = classifyRisk({
        commitmentSAR: input.commitmentSAR ?? input.financialImpactSAR,
        customerFacing: input.customerFacing,
        legalCommitment: input.legalCommitment,
        regulatoryAction: input.regulatoryAction,
        sensitiveData: input.sensitiveData,
        securityImpact: input.securityImpact,
        irreversible: input.irreversible,
        affectsManyCustomers: input.affectsManyCustomers,
        threatensContinuity: input.threatensContinuity,
      });
      return { output: { riskLevel } };
    }

    case "CREATE_DECISION_PACKET": {
      if (prior.decisionId) return { output: { decisionId: prior.decisionId } };
      const riskLevel = String(prior.riskLevel || "LOW") as RiskLevel;
      const packet = buildDecisionPacket({
        tenantId: instance.tenant_id,
        title: input.title,
        recommendation: input.recommendation,
        facts: input.facts,
        assumptions: input.assumptions || [],
        options: input.options,
        financialImpactSAR: input.financialImpactSAR,
        riskLevel,
        successCriteria: input.successCriteria,
        killCriteria: input.killCriteria,
        dissentingView: input.dissentingView,
        reviewAt: input.reviewAt,
        objectiveId: input.objectiveId,
        opportunityId: input.opportunityId,
      });
      const { error } = await supabase.from("decision_packets").insert({
        id: packet.id,
        tenant_id: packet.tenantId,
        objective_id: packet.objectiveId || null,
        opportunity_id: packet.opportunityId || null,
        title: packet.title,
        recommendation: packet.recommendation,
        facts: packet.facts,
        assumptions: packet.assumptions,
        options: packet.options,
        financial_impact_sar: packet.financialImpactSAR,
        risk_level: packet.riskLevel,
        dissenting_view: packet.dissentingView || null,
        required_approvals: packet.requiredApprovals,
        success_criteria: packet.successCriteria,
        kill_criteria: packet.killCriteria,
        status: packet.requiredApprovals.length ? "PENDING_APPROVAL" : "APPROVED",
        review_at: packet.reviewAt,
        created_by: String(prior.actorId || "system"),
        workflow_instance_id: instance.id,
      });
      if (error) throw error;
      if (packet.requiredApprovals.length) {
        const approvals = packet.requiredApprovals.map((role) => ({
          tenant_id: instance.tenant_id,
          decision_id: packet.id,
          required_role: role,
          status: "PENDING",
        }));
        const { error: approvalError } = await supabase.from("decision_approvals").upsert(approvals, { onConflict: "decision_id,required_role" });
        if (approvalError) throw approvalError;
      }
      return { output: { decisionId: packet.id, requiredApprovals: packet.requiredApprovals } };
    }

    case "WAIT_FOR_APPROVAL": {
      const decisionId = String(prior.decisionId || "");
      if (!decisionId) throw new Error("Decision packet missing.");
      const required = (prior.requiredApprovals || []) as ExecutiveRole[];
      const approved = await requiredApprovalsSatisfied(instance.tenant_id, decisionId, required);
      if (!approved) return { output: { approvalStatus: "PENDING" }, waiting: true };
      await supabase.from("decision_packets").update({ status: "APPROVED", updated_at: new Date().toISOString() }).eq("tenant_id", instance.tenant_id).eq("id", decisionId);
      return { output: { approvalStatus: "APPROVED", approvedAt: new Date().toISOString() } };
    }

    case "RESERVE_BUDGET": {
      const requestedSAR = Number(input.commitmentSAR || 0);
      if (requestedSAR <= 0) return { output: { budgetStatus: "NOT_REQUIRED" } };
      if (prior.commitmentId) return { output: { commitmentId: prior.commitmentId, budgetStatus: "RESERVED" } };
      const check = canReserveBudget(
        { approvedSAR: input.approvedBudgetSAR, committedSAR: 0, consumedSAR: 0, releasedSAR: 0 },
        requestedSAR
      );
      if (!check.allowed) throw new Error(check.reason);
      const commitmentId = randomUUID();
      const { error } = await supabase.from("budget_commitments").insert({
        id: commitmentId,
        tenant_id: instance.tenant_id,
        decision_id: prior.decisionId,
        amount_sar: requestedSAR,
        status: "RESERVED",
        reference: `workflow:${instance.id}`,
      });
      if (error) throw error;
      return { output: { commitmentId, budgetStatus: "RESERVED", reservedSAR: requestedSAR } };
    }

    case "CREATE_PROJECT": {
      if (prior.projectId) return { output: { projectId: prior.projectId } };
      const projectId = randomUUID();
      const riskLevel = String(prior.riskLevel || "LOW");
      const { error } = await supabase.from("projects").insert({
        id: projectId,
        tenant_id: instance.tenant_id,
        workflow_instance_id: instance.id,
        name: input.title,
        request: input.recommendation,
        status: "ACTIVE",
        budget: input.commitmentSAR || 0,
        approved_budget: input.approvedBudgetSAR,
        risk_level: riskLevel,
        approval_status: "APPROVED",
        strategic_direction: input.recommendation,
        next_review_at: input.reviewAt,
      });
      if (error) throw error;
      await supabase.from("decision_packets").update({ project_id: projectId, updated_at: new Date().toISOString() }).eq("tenant_id", instance.tenant_id).eq("id", prior.decisionId);
      return { output: { projectId } };
    }

    case "DISPATCH_ACTIONS": {
      const actions = input.actions || [];
      if (actions.length === 0) return { output: { actionIds: [] } };
      if (Array.isArray(prior.actionIds) && prior.actionIds.length > 0) return { output: { actionIds: prior.actionIds } };
      const rows = actions.map((action, index) => ({
        id: randomUUID(),
        tenant_id: instance.tenant_id,
        project_id: prior.projectId,
        workflow_instance_id: instance.id,
        action_type: action.actionType,
        title: action.title,
        description: action.description || null,
        status: "WAITING_INTEGRATION",
        execution_mode: "READY_FOR_INTEGRATION",
        provider: action.provider || null,
        requires_approval: false,
        approval_status: "NOT_REQUIRED",
        payload: { ...(action.payload || {}), workflowStep: index + 1 },
      }));
      const { error } = await supabase.from("business_actions").insert(rows);
      if (error) throw error;
      return { output: { actionIds: rows.map((row) => row.id) } };
    }

    case "FINALIZE":
      return { output: { finalizedAt: new Date().toISOString(), outcome: "PROJECT_READY_FOR_EXECUTION" } };

    default:
      throw new Error(`Unsupported workflow step: ${step.step_key}`);
  }
}

function nextStepKey(currentOrder: number) {
  return IDEA_TO_INVESTMENT_WORKFLOW.steps[currentOrder] || null;
}

async function processStep(instance: RuntimeRow, step: StepRow) {
  const supabase = requireRuntime();
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("workflow_steps")
    .update({ status: "RUNNING", attempt: Number(step.attempt || 0) + 1, started_at: now, updated_at: now })
    .eq("id", step.id)
    .eq("tenant_id", instance.tenant_id)
    .in("status", ["PENDING", "RETRY", "WAITING_APPROVAL"])
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { claimed: false };

  try {
    await supabase.from("workflow_instances").update({ status: "RUNNING", current_step: step.step_key, started_at: instance.created_at, updated_at: now }).eq("id", instance.id).eq("tenant_id", instance.tenant_id);
    const result = await executeStep(instance, claimed as StepRow);
    const mergedOutput = { ...(instance.output || {}), ...result.output };

    if (result.waiting) {
      const availableAt = new Date(Date.now() + 15 * 60_000).toISOString();
      await supabase.from("workflow_steps").update({ status: "WAITING_APPROVAL", output: result.output, available_at: availableAt, updated_at: now }).eq("id", step.id).eq("tenant_id", instance.tenant_id);
      await supabase.from("workflow_instances").update({ status: "WAITING_APPROVAL", output: mergedOutput, next_wake_at: availableAt, updated_at: now }).eq("id", instance.id).eq("tenant_id", instance.tenant_id);
      return { claimed: true, waiting: true };
    }

    await supabase.from("workflow_steps").update({ status: "COMPLETED", output: result.output, completed_at: now, updated_at: now }).eq("id", step.id).eq("tenant_id", instance.tenant_id);
    const next = nextStepKey(step.step_order);
    if (!next) {
      await supabase.from("workflow_instances").update({ status: "COMPLETED", current_step: null, output: mergedOutput, completed_at: now, updated_at: now }).eq("id", instance.id).eq("tenant_id", instance.tenant_id);
      const event = createCompanyEvent({
        type: "workflow.completed",
        tenantId: instance.tenant_id,
        actorId: String(mergedOutput.actorId || "system"),
        actorType: "SYSTEM",
        entityType: "workflow",
        entityId: instance.id,
        correlationId: instance.correlation_id,
        payload: { workflowId: instance.workflow_id, projectId: mergedOutput.projectId || null },
      });
      await appendCompanyEvent(event);
      return { claimed: true, completed: true };
    }

    await supabase.from("workflow_instances").update({ status: "PENDING", current_step: next, output: mergedOutput, next_wake_at: now, updated_at: now }).eq("id", instance.id).eq("tenant_id", instance.tenant_id);
    return { claimed: true, completed: false };
  } catch (error) {
    const attempt = Number(step.attempt || 0) + 1;
    const terminal = attempt >= 5;
    const availableAt = new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000).toISOString();
    const errorPayload = { message: error instanceof Error ? error.message : String(error), attempt, at: now };
    await supabase.from("workflow_steps").update({ status: terminal ? "FAILED" : "RETRY", error: errorPayload, available_at: availableAt, updated_at: now }).eq("id", step.id).eq("tenant_id", instance.tenant_id);
    await supabase.from("workflow_instances").update({ status: terminal ? "FAILED" : "RETRY", error: errorPayload, next_wake_at: availableAt, updated_at: now }).eq("id", instance.id).eq("tenant_id", instance.tenant_id);
    return { claimed: true, failed: terminal, error: errorPayload };
  }
}

export async function runWorkflowTick(options: { tenantId?: string; limit?: number } = {}) {
  const supabase = requireRuntime();
  const now = new Date().toISOString();
  let query = supabase
    .from("workflow_steps")
    .select("*, workflow_instances!inner(*)")
    .eq("workflow_instances.workflow_id", IDEA_TO_INVESTMENT_WORKFLOW.id)
    .in("status", ["PENDING", "RETRY", "WAITING_APPROVAL"])
    .lte("available_at", now)
    .order("available_at", { ascending: true })
    .limit(Math.min(Math.max(options.limit || 10, 1), 50));
  if (options.tenantId) query = query.eq("tenant_id", options.tenantId);
  const { data, error } = await query;
  if (error) throw error;

  const results: unknown[] = [];
  for (const row of data || []) {
    const instanceValue = row.workflow_instances as RuntimeRow | RuntimeRow[];
    const instance = Array.isArray(instanceValue) ? instanceValue[0] : instanceValue;
    if (!instance || instance.current_step !== row.step_key) continue;
    results.push(await processStep(instance, row as StepRow));
  }
  return { processed: results.length, results };
}

export async function listWorkflowInstances(tenantId: string, limit = 50) {
  const supabase = requireRuntime();
  const { data, error } = await supabase
    .from("workflow_instances")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data || [];
}
