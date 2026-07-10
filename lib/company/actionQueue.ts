import { invalidateCache } from "../cache";
import { getSupabaseAdmin } from "../supabase";
import { recordAudit } from "./audit";

export type CompanyActionStatus =
  | "QUEUED"
  | "WAITING_APPROVAL"
  | "WAITING_INTEGRATION"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

export type CompanyAction = {
  id: string;
  project_id?: string | null;
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
  result?: Record<string, unknown>;
  error?: string;
  note?: string;
};

const validTransitions: Record<CompanyActionStatus, CompanyActionStatus[]> = {
  QUEUED: ["WAITING_APPROVAL", "WAITING_INTEGRATION", "RUNNING", "DONE", "FAILED", "CANCELLED"],
  WAITING_APPROVAL: ["QUEUED", "RUNNING", "CANCELLED", "FAILED"],
  WAITING_INTEGRATION: ["QUEUED", "RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["DONE", "FAILED", "CANCELLED"],
  DONE: [],
  FAILED: ["QUEUED", "RUNNING", "CANCELLED"],
  CANCELLED: [],
};

const executableStatuses: CompanyActionStatus[] = ["QUEUED", "WAITING_INTEGRATION", "FAILED"];

export function normalizeActionInitialStatus(input: {
  requiresApproval?: boolean;
  executionMode?: string;
  approvalStatus?: string;
}): CompanyActionStatus {
  if (input.requiresApproval && input.approvalStatus !== "APPROVED" && input.approvalStatus !== "NOT_REQUIRED") return "WAITING_APPROVAL";
  if (input.executionMode === "READY_FOR_INTEGRATION") return "WAITING_INTEGRATION";
  return "QUEUED";
}

export async function listCompanyActions(limit = 50): Promise<CompanyAction[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("business_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as CompanyAction[];
}

export async function getCompanyAction(id: string): Promise<CompanyAction | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required to load a company action.");

  const { data, error } = await supabase
    .from("business_actions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as CompanyAction | null) || null;
}

/**
 * Atomically claims an action for external execution.
 * The optimistic status predicate prevents two browser clicks or workers from
 * executing the same external side effect at the same time.
 */
export async function claimCompanyActionForExecution(id: string, actor = "system"): Promise<CompanyAction> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required to execute a company action.");

  const current = await getCompanyAction(id);
  if (!current) throw new Error("Action not found.");
  if (current.status === "DONE") return current;
  if (!executableStatuses.includes(current.status)) {
    throw new Error(`Action cannot be executed while its status is ${current.status}.`);
  }
  if (current.requires_approval && !["APPROVED", "NOT_REQUIRED"].includes(String(current.approval_status || ""))) {
    throw new Error("Action approval is required before external execution.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("business_actions")
    .update({
      status: "RUNNING",
      attempts: Number(current.attempts || 0) + 1,
      last_attempt_at: now,
      error: null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", current.status)
    .select("*")
    .maybeSingle();

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

  const { data: current, error: currentError } = await supabase
    .from("business_actions")
    .select("*")
    .eq("id", input.id)
    .single();

  if (currentError) throw currentError;
  if (!current) throw new Error("Action not found.");

  const currentStatus = String(current.status || "QUEUED") as CompanyActionStatus;
  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(input.status) && input.status !== currentStatus) {
    throw new Error(`Invalid action transition: ${currentStatus} → ${input.status}`);
  }

  // Attempts are counted when execution starts. Marking the same attempt as
  // failed must not increment the counter a second time.
  const attempts = input.status === "RUNNING"
    ? Number(current.attempts || 0) + 1
    : Number(current.attempts || 0);

  const { data, error } = await supabase
    .from("business_actions")
    .update({
      status: input.status,
      result: input.result ?? current.result ?? null,
      error: input.error ?? null,
      attempts,
      last_attempt_at: ["RUNNING", "FAILED", "DONE"].includes(input.status) ? new Date().toISOString() : current.last_attempt_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("*")
    .single();

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
