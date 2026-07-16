import { getSupabaseAdmin } from "../supabase";
import { publishOutboxBatch } from "./outboxPublisher";
import { runWorkflowTick } from "./workflowRuntime";
import { recoverPendingAgentProjects } from "../company/internalAgentExecutor";
import {
  getOwnerAbsencePolicy,
  recordOwnerAbsenceSweep,
} from "../company/ownerAbsence";

const BLOCKING_OR_TERMINAL_STATUSES = new Set([
  "WAITING_APPROVAL",
  "RETRY",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

type WorkflowSnapshot = {
  id: string;
  status: string;
  current_step?: string | null;
  output?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  updated_at?: string;
};

function bounded(value: number | undefined, fallback: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), maximum);
}

async function loadWorkflow(tenantId: string, workflowInstanceId: string): Promise<WorkflowSnapshot> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for durable workflow execution.");

  const { data, error } = await supabase
    .from("workflow_instances")
    .select("id,status,current_step,output,error,updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", workflowInstanceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Workflow instance not found in this tenant.");
  return data as WorkflowSnapshot;
}

async function prioritizePendingStep(tenantId: string, workflow: WorkflowSnapshot) {
  if (workflow.status !== "PENDING" || !workflow.current_step) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for durable workflow execution.");

  const { error } = await supabase
    .from("workflow_steps")
    .update({ available_at: "1970-01-01T00:00:00.000Z", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("workflow_instance_id", workflow.id)
    .eq("step_key", workflow.current_step)
    .in("status", ["PENDING", "WAITING_APPROVAL"]);
  if (error) throw error;
}

export async function advanceWorkflowUntilBlocked(options: {
  tenantId: string;
  workflowInstanceId: string;
  maxCycles?: number;
  batchLimit?: number;
}) {
  const maxCycles = bounded(options.maxCycles, 10, 16);
  const batchLimit = bounded(options.batchLimit, 50, 50);
  const ticks: Array<{ processed: number }> = [];
  let totalProcessed = 0;

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const before = await loadWorkflow(options.tenantId, options.workflowInstanceId);
    if (BLOCKING_OR_TERMINAL_STATUSES.has(before.status)) {
      return { workflow: before, cycles: cycle, totalProcessed, ticks, settled: true };
    }

    await prioritizePendingStep(options.tenantId, before);
    const tick = await runWorkflowTick({ tenantId: options.tenantId, limit: batchLimit });
    ticks.push({ processed: tick.processed });
    totalProcessed += tick.processed;

    if (tick.processed === 0) {
      const stalled = await loadWorkflow(options.tenantId, options.workflowInstanceId);
      return { workflow: stalled, cycles: cycle + 1, totalProcessed, ticks, settled: false, stalled: true };
    }
  }

  const workflow = await loadWorkflow(options.tenantId, options.workflowInstanceId);
  return {
    workflow,
    cycles: maxCycles,
    totalProcessed,
    ticks,
    settled: BLOCKING_OR_TERMINAL_STATUSES.has(workflow.status),
    maxCyclesReached: true,
  };
}

export async function runCoreRuntimeSweep(options: {
  tenantId: string;
  maxWorkflowCycles?: number;
  workflowBatchLimit?: number;
  outboxLimit?: number;
}) {
  const maxWorkflowCycles = bounded(options.maxWorkflowCycles, 8, 16);
  const workflowBatchLimit = bounded(options.workflowBatchLimit, 25, 50);
  const outboxLimit = bounded(options.outboxLimit, 25, 100);
  const ticks: Array<{ processed: number }> = [];
  let totalProcessed = 0;

  for (let cycle = 0; cycle < maxWorkflowCycles; cycle += 1) {
    const tick = await runWorkflowTick({ tenantId: options.tenantId, limit: workflowBatchLimit });
    ticks.push({ processed: tick.processed });
    totalProcessed += tick.processed;
    if (tick.processed === 0) break;
  }

  const outbox = await publishOutboxBatch({ tenantId: options.tenantId, limit: outboxLimit });
  const ownerAbsencePolicy = await getOwnerAbsencePolicy(options.tenantId);
  const agentProjectLimit = ownerAbsencePolicy.effectiveStatus === "ACTIVE" ? 3 : 1;
  const agentExecution = await recoverPendingAgentProjects(options.tenantId, agentProjectLimit).catch((error) => ({
    selected: 0,
    results: [],
    error: error instanceof Error ? error.message : "Agent recovery failed",
  }));
  const continuity = await recordOwnerAbsenceSweep({
    tenantId: options.tenantId,
    agentProjectsSelected: agentExecution.selected,
    agentProjectsCompleted: agentExecution.results.length,
    failedAgentActions: agentExecution.results.reduce((sum, result) => sum + result.failed, 0),
  });
  return {
    workflow: {
      cycles: ticks.length,
      totalProcessed,
      ticks,
    },
    outbox,
    agentExecution,
    continuity,
  };
}
