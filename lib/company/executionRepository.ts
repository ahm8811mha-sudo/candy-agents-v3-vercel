import { createHash, randomUUID } from "node:crypto";
import { rememberDurableApprovalRow, type ApprovalItem } from "../approvals";
import { rememberDurableAuditRow } from "./audit";
import { normalizeTenantId } from "../tenant";
import { getSupabaseAdmin } from "../supabase";

export type ExecutionBundleTask = {
  title: string;
  description?: string;
  content: string;
  status: string;
  priority: string;
  ownerRole?: string;
  kpiName?: string;
  kpiTarget?: number;
  dueDate?: string;
  metadata?: Record<string, unknown>;
};

export type ExecutionBundleKpi = {
  name: string;
  target: number;
  current?: number;
  unit: string;
  status: string;
  dueDate?: string;
};

export type ExecutionBundleAction = {
  actionType: string;
  title: string;
  description?: string;
  status: string;
  executionMode: string;
  provider?: string;
  requiresApproval: boolean;
  approvalStatus: string;
  payload?: Record<string, unknown>;
};

export type ExecutionBundleAlert = {
  severity: string;
  title: string;
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type CreateExecutionBundleInput = {
  source: "company-execution" | "approved-idea";
  /** A caller-supplied retry key. The raw value is hashed before persistence. */
  idempotencyKey: string;
  actorId: string;
  actorRole?: string;
  tenantId?: string;
  project: {
    name: string;
    request: string;
    status: string;
    budget: number;
    approvedBudget: number;
    healthScore: number;
    riskLevel: string;
    approvalStatus: string;
    strategicDirection?: string;
    financialSnapshot?: Record<string, unknown>;
    nextReviewAt?: string;
  };
  tasks: ExecutionBundleTask[];
  kpis: ExecutionBundleKpi[];
  actions: ExecutionBundleAction[];
  alerts?: ExecutionBundleAlert[];
  memory?: {
    eventType: string;
    title: string;
    summary: string;
    decisionQuality?: string;
    metadata?: Record<string, unknown>;
  };
  financialDecision?: {
    request: string;
    financials: Record<string, unknown>;
    cfoReport: string;
    ceoDecision: string;
  };
  approval?: {
    type?: "GENERAL";
    title: string;
    detail: string;
    amount?: number;
    requestedRole: string;
    tier: string;
    riskLevel: string;
    metadata?: Record<string, unknown>;
  };
  audit: {
    action: string;
    detail: string;
    tier?: string;
    metadata?: Record<string, unknown>;
  };
};

export type ExecutionBundleResult = {
  idempotent: boolean;
  correlationId: string;
  workflowInstanceId: string;
  project: Record<string, unknown>;
  tasks: Record<string, unknown>[];
  kpis: Record<string, unknown>[];
  approval: ApprovalItem | null;
  audit: Record<string, unknown> | null;
  outboxId?: string;
};

function boundedText(value: string, label: string, max: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required.`);
  if (clean.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return clean;
}

function boundedItems<T>(items: T[], label: string) {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array.`);
  if (items.length > 100) throw new Error(`${label} exceeds the 100-item execution limit.`);
  return items;
}

export function executionCorrelationId(source: string, idempotencyKey: string) {
  const cleanSource = source.trim().replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "execution";
  const key = boundedText(idempotencyKey, "Execution idempotency key", 256);
  const digest = createHash("sha256").update(`${cleanSource}:${key}`).digest("hex");
  return `${cleanSource}:${digest}`;
}

function buildRpcBundle(input: CreateExecutionBundleInput) {
  const tenantId = normalizeTenantId(input.tenantId);
  const correlationId = executionCorrelationId(input.source, input.idempotencyKey);
  const workflowInstanceId = randomUUID();
  const projectId = randomUUID();
  const eventId = `evt-execution-${randomUUID()}`;
  const outboxId = `out-execution-${randomUUID()}`;
  const approvalId = input.approval ? `apr-execution-${projectId}` : null;

  boundedText(input.project.name, "Project name", 120);
  boundedText(input.project.request, "Project request", 20_000);
  boundedItems(input.tasks, "Execution tasks");
  boundedItems(input.kpis, "Execution KPIs");
  boundedItems(input.actions, "Execution actions");
  boundedItems(input.alerts || [], "Execution alerts");

  return {
    tenantId,
    correlationId,
    workflowInstanceId,
    actorId: boundedText(input.actorId, "Execution actor", 160),
    source: input.source,
    project: { id: projectId, ...input.project },
    tasks: input.tasks.map((task) => ({ id: `execution-task-${randomUUID()}`, ...task })),
    kpis: input.kpis.map((kpi) => ({ id: randomUUID(), ...kpi })),
    actions: input.actions.map((action) => ({ id: randomUUID(), ...action })),
    alerts: (input.alerts || []).map((alert) => ({ id: randomUUID(), ...alert })),
    memory: input.memory ? { id: randomUUID(), ...input.memory } : null,
    financialDecision: input.financialDecision ? { id: randomUUID(), ...input.financialDecision } : null,
    approval: input.approval && approvalId
      ? {
          id: approvalId,
          type: input.approval.type || "GENERAL",
          title: input.approval.title,
          detail: input.approval.detail,
          amount: input.approval.amount,
          requestedRole: input.approval.requestedRole,
          dedupeKey: `company-execution:${projectId}`,
          metadata: {
            source: "governanceOS",
            actionKind: "COMPANY_EXECUTION_PROJECT",
            governanceTier: input.approval.tier,
            tier: input.approval.tier,
            riskLevel: input.approval.riskLevel,
            requestedBudget: input.project.budget,
            ...(input.approval.metadata || {}),
          },
        }
      : null,
    audit: {
      id: `aud-execution-${workflowInstanceId}`,
      actor: input.actorId,
      role: input.actorRole || null,
      action: input.audit.action,
      detail: input.audit.detail,
      tier: input.audit.tier || input.approval?.tier || null,
      metadata: input.audit.metadata || {},
    },
    eventId,
    outboxId,
  };
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

/**
 * The only write path for a new execution project. The database RPC commits
 * the workflow, project, work items, governance record, audit event, and
 * outbox row in one transaction. There is deliberately no multi-insert
 * compatibility fallback: an old schema must fail closed instead of leaving a
 * partially-created project.
 */
export async function createExecutionBundle(input: CreateExecutionBundleInput): Promise<ExecutionBundleResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for durable company execution.");

  const bundle = buildRpcBundle(input);
  const { data, error } = await supabase.rpc("orvanta_create_execution_bundle", { p_bundle: bundle });
  if (error) {
    throw new Error(`Atomic execution bundle failed: ${error.message}`);
  }
  if (!data || typeof data !== "object") throw new Error("Atomic execution bundle returned an invalid response.");

  const row = data as Record<string, unknown>;
  const approvalRow = row.approval && typeof row.approval === "object"
    ? row.approval as Record<string, unknown>
    : null;
  const auditRow = row.audit && typeof row.audit === "object"
    ? row.audit as Record<string, unknown>
    : null;

  const approval = approvalRow ? rememberDurableApprovalRow(approvalRow) : null;
  if (auditRow) rememberDurableAuditRow(auditRow);

  return {
    idempotent: Boolean(row.idempotent),
    correlationId: String(row.correlationId || bundle.correlationId),
    workflowInstanceId: String(row.workflowInstanceId || bundle.workflowInstanceId),
    project: (row.project && typeof row.project === "object" ? row.project : {}) as Record<string, unknown>,
    tasks: asRows(row.tasks),
    kpis: asRows(row.kpis),
    approval,
    audit: auditRow,
    outboxId: row.outboxId ? String(row.outboxId) : undefined,
  };
}
