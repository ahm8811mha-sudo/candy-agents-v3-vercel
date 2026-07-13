import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";

export type CronRunHandle = {
  id: string;
  startedAt: number;
  tracked: boolean;
};

type StartCronRunInput = {
  tenantId: string;
  jobName: string;
  requestId?: string;
  correlationId?: string;
  schedule?: string | null;
  details?: Record<string, unknown>;
};

type CompleteCronRunInput = {
  processedCount?: number;
  failedCount?: number;
  details?: Record<string, unknown>;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function startCronRun(input: StartCronRunInput): Promise<CronRunHandle> {
  const id = randomUUID();
  const startedAt = Date.now();
  const supabase = getSupabaseAdmin();
  if (!supabase) return { id, startedAt, tracked: false };

  const { error } = await supabase.from("cron_runs").insert({
    id,
    tenant_id: input.tenantId,
    job_name: input.jobName,
    status: "STARTED",
    started_at: new Date(startedAt).toISOString(),
    heartbeat_at: new Date(startedAt).toISOString(),
    request_id: input.requestId || null,
    correlation_id: input.correlationId || null,
    schedule: input.schedule || null,
    details: input.details || {},
  });

  if (error) {
    console.error("[orvanta:cron] failed to record cron start", {
      jobName: input.jobName,
      error: error.message,
    });
    return { id, startedAt, tracked: false };
  }

  return { id, startedAt, tracked: true };
}

export async function heartbeatCronRun(handle: CronRunHandle, details?: Record<string, unknown>) {
  if (!handle.tracked) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from("cron_runs")
    .update({
      heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(details ? { details } : {}),
    })
    .eq("id", handle.id);

  if (error) {
    console.error("[orvanta:cron] failed to record heartbeat", {
      runId: handle.id,
      error: error.message,
    });
  }
}

export async function succeedCronRun(handle: CronRunHandle, input: CompleteCronRunInput = {}) {
  if (!handle.tracked) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const completedAt = Date.now();
  const { error } = await supabase
    .from("cron_runs")
    .update({
      status: "SUCCEEDED",
      completed_at: new Date(completedAt).toISOString(),
      heartbeat_at: new Date(completedAt).toISOString(),
      duration_ms: Math.max(0, completedAt - handle.startedAt),
      processed_count: Math.max(0, Math.trunc(input.processedCount || 0)),
      failed_count: Math.max(0, Math.trunc(input.failedCount || 0)),
      details: input.details || {},
      error_code: null,
      error_message: null,
      updated_at: new Date(completedAt).toISOString(),
    })
    .eq("id", handle.id);

  if (error) {
    console.error("[orvanta:cron] failed to record cron success", {
      runId: handle.id,
      error: error.message,
    });
  }
}

export async function failCronRun(handle: CronRunHandle, errorValue: unknown, input: CompleteCronRunInput = {}) {
  if (!handle.tracked) {
    console.error("[orvanta:cron] untracked cron failure", { runId: handle.id, error: message(errorValue) });
    return;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const completedAt = Date.now();
  const errorMessage = message(errorValue).slice(0, 2000);
  const { error } = await supabase
    .from("cron_runs")
    .update({
      status: "FAILED",
      completed_at: new Date(completedAt).toISOString(),
      heartbeat_at: new Date(completedAt).toISOString(),
      duration_ms: Math.max(0, completedAt - handle.startedAt),
      processed_count: Math.max(0, Math.trunc(input.processedCount || 0)),
      failed_count: Math.max(1, Math.trunc(input.failedCount || 1)),
      details: input.details || {},
      error_code: errorValue instanceof Error ? errorValue.name : "CRON_FAILED",
      error_message: errorMessage,
      updated_at: new Date(completedAt).toISOString(),
    })
    .eq("id", handle.id);

  if (error) {
    console.error("[orvanta:cron] failed to record cron failure", {
      runId: handle.id,
      originalError: errorMessage,
      recorderError: error.message,
    });
  }
}
