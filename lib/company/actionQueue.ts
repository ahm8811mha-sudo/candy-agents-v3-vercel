import { invalidateCache } from "../cache";
import { getSupabaseAdmin } from "../supabase";
import { isMultiTenantEnabled, getTenantId } from "../tenant";
import { recordAudit } from "./audit";
import {
  assertActionAllowedDuringOwnerAbsence,
  assertCompletionEvidenceDuringOwnerAbsence,
} from "./ownerAbsence";

export type CompanyActionStatus =
  | "QUEUED"
  | "WAITING_APPROVAL"
  | "WAITING_INTEGRATION"
  | "RUNNING"
  | "WAITING_RECONCILIATION"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

export type CompanyAction = {
  id: string;
  tenant_id?: string | null;
  project_id?: string | null;
  action_sequence?: number | null;
  action_number?: string | null;
  action_date?: string | null;
  workflow_instance_id?: string | null;
  action_type: string;
  title: string;
  description?: string | null;
  status: CompanyActionStatus;
  execution_mode?: string | null;
  provider?: string | null;
  requires_approval?: boolean | null;
  approval_status?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attempts?: number | null;
  last_attempt_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ActionTransitionInput = {
  id: string;
  status: CompanyActionStatus;
  actor?: string;
  tenantId?: string;
  result?: Record<string, unknown>;
  error?: string;
  note?: string;
};

const validTransitions: Record<CompanyActionStatus, CompanyActionStatus[]> = {
  QUEUED: ["WAITING_APPROVAL", "WAITING_INTEGRATION", "RUNNING", "WAITING_RECONCILIATION", "DONE", "FAILED", "CANCELLED"],
  WAITING_APPROVAL: ["QUEUED", "RUNNING", "CANCELLED", "FAILED"],
  WAITING_INTEGRATION: ["QUEUED", "RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["WAITING_RECONCILIATION", "DONE", "FAILED", "CANCELLED"],
  WAITING_RECONCILIATION: ["DONE", "FAILED", "CANCELLED"],
  DONE: [],
  FAILED: ["QUEUED", "RUNNING", "CANCELLED"],
  CANCELLED: [],
};

const executableStatuses: CompanyActionStatus[] = ["QUEUED", "WAITING_INTEGRATION", "FAILED"];

function tenantFor(tenantId?: string) {
  return tenantId?.trim() || (isMultiTenantEnabled() ? getTenantId() : undefined);
}

export function normalizeActionInitialStatus(input: {
  requiresApproval?: boolean;
  executionMode?: string;
  approvalStatus?: string;
}): CompanyActionStatus {
  if (input.requiresApproval && input.approvalStatus !== "APPROVED" && input.approvalStatus !== "NOT_REQUIRED") return "WAITING_APPROVAL";
  if (input.executionMode === "READY_FOR_INTEGRATION") return "WAITING_INTEGRATION";
  return "QUEUED";
}

export async function listCompanyActions(limit = 50, tenantId?: string): Promise<CompanyAction[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase
    .from("business_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const tenant = tenantFor(tenantId);
  if (tenant) query = query.eq("tenant_id", tenant);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as CompanyAction[];
}

export async function getCompanyAction(id: string, tenantId?: string): Promise<CompanyAction | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required to load a company action.");

  let query = supabase.from("business_actions").select("*").eq("id", id);
  const tenant = tenantFor(tenantId);
  if (tenant) query = query.eq("tenant_id", tenant);
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return (data as CompanyAction | null) || null;
}

/**
 * Atomically claims an action for external execution.
 * The optimistic status predicate prevents two browser clicks or workers from
 * executing the same external side effect at the same time.
 */
export async function claimCompanyActionForExecution(id: string, actor = "system", tenantId?: string): Promise<CompanyAction> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required to execute a company action.");

  const tenant = tenantFor(tenantId);
  const current = await getCompanyAction(id, tenant);
  if (!current) throw new Error("Action not found.");
  if (current.status === "DONE") return current;
  if (!executableStatuses.includes(current.status)) {
    throw new Error(`Action cannot be executed while its status is ${current.status}.`);
  }
  if (current.requires_approval && !["APPROVED", "NOT_REQUIRED"].includes(String(current.approval_status || ""))) {
    throw new Error("Action approval is required before external execution.");
  }

  // This is a server-side authority gate, not a UI-only control. During an
  // active owner-absence window, strategic/material/external work is deferred
  // before any executor can claim the action or create an external side effect.
  await assertActionAllowedDuringOwnerAbsence(current, tenant);

  const now = new Date().toISOString();
  let update = supabase
    .from("business_actions")
    .update({
      status: "RUNNING",
      attempts: Number(current.attempts || 0) + 1,
      last_attempt_at: now,
      error: null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", current.status);
  if (tenant) update = update.eq("tenant_id", tenant);
  const { data, error } = await update.select("*").maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Action is already being executed by another request.");

  recordAudit({
    actor,
    action: "ACTION_EXECUTION_CLAIMED",
    entityType: "business_action",
    entityId: id,
    detail: `${current.status} → RUNNING — external execution claimed`,
  });
  invalidateCache("dashboard-data");
  return data as CompanyAction;
}

export async function updateCompanyActionStatus(input: ActionTransitionInput): Promise<CompanyAction> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required to update action status.");

  const tenant = tenantFor(input.tenantId);
  let currentQuery = supabase.from("business_actions").select("*").eq("id", input.id);
  if (tenant) currentQuery = currentQuery.eq("tenant_id", tenant);
  const { data: current, error: currentError } = await currentQuery.single();

  if (currentError) throw currentError;
  if (!current) throw new Error("Action not found.");

  const currentStatus = String(current.status || "QUEUED") as CompanyActionStatus;
  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(input.status) && input.status !== currentStatus) {
    throw new Error(`Invalid action transition: ${currentStatus} → ${input.status}`);
  }

  if (input.status === "DONE") {
    await assertCompletionEvidenceDuringOwnerAbsence(
      tenant,
      input.result ?? current.result
    );
  }

  const attempts = input.status === "RUNNING"
    ? Number(current.attempts || 0) + 1
    : Number(current.attempts || 0);

  let update = supabase
    .from("business_actions")
    .update({
      status: input.status,
      result: input.result ?? current.result ?? null,
      error: input.error ?? null,
      attempts,
      last_attempt_at: ["RUNNING", "FAILED", "DONE", "WAITING_RECONCILIATION"].includes(input.status) ? new Date().toISOString() : current.last_attempt_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (tenant) update = update.eq("tenant_id", tenant);
  const { data, error } = await update.select("*").single();

  if (error) throw error;

  recordAudit({
    actor: input.actor || "system",
    action: "ACTION_STATUS_CHANGE",
    entityType: "business_action",
    entityId: input.id,
    detail: `${currentStatus} → ${input.status}${input.note ? ` — ${input.note}` : ""}`,
  });

  invalidateCache("dashboard-data");
  return data as CompanyAction;
}
