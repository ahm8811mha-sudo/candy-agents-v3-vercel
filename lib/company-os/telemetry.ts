import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";

export type TelemetryStatus = "OK" | "ERROR";

export type TelemetryRecord = {
  tenantId: string;
  correlationId: string;
  operation: string;
  category: "API" | "WORKFLOW" | "CONNECTOR" | "DATABASE" | "AI" | "POLICY";
  status: TelemetryStatus;
  durationMs: number;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  attributes?: Record<string, unknown>;
  error?: string;
};

function logTelemetryFailure(kind: string, error: unknown, context: Record<string, unknown>) {
  console.error("[orvanta:telemetry] persistence failed", {
    kind,
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
}

export async function recordTelemetry(record: TelemetryRecord) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[orvanta:telemetry] Supabase is unavailable", {
      operation: record.operation,
      correlationId: record.correlationId,
    });
    return false;
  }

  const { error } = await supabase.from("operational_telemetry").insert({
    id: randomUUID(),
    tenant_id: record.tenantId,
    correlation_id: record.correlationId,
    operation: record.operation,
    category: record.category,
    status: record.status,
    duration_ms: Math.max(0, Math.round(record.durationMs)),
    actor_id: record.actorId || null,
    entity_type: record.entityType || null,
    entity_id: record.entityId || null,
    attributes: record.attributes || {},
    error: record.error || null,
  });
  if (error) throw error;
  return true;
}

export async function withTelemetrySpan<T>(
  input: Omit<TelemetryRecord, "status" | "durationMs" | "error">,
  work: () => Promise<T>
): Promise<T> {
  const started = performance.now();
  try {
    const value = await work();
    try {
      await recordTelemetry({ ...input, status: "OK", durationMs: performance.now() - started });
    } catch (telemetryError) {
      logTelemetryFailure("span-success", telemetryError, {
        operation: input.operation,
        correlationId: input.correlationId,
      });
    }
    return value;
  } catch (error) {
    try {
      await recordTelemetry({
        ...input,
        status: "ERROR",
        durationMs: performance.now() - started,
        error: error instanceof Error ? error.message.slice(0, 1500) : String(error).slice(0, 1500),
      });
    } catch (telemetryError) {
      logTelemetryFailure("span-error", telemetryError, {
        operation: input.operation,
        correlationId: input.correlationId,
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

export async function recordModelExecution(input: {
  tenantId: string;
  correlationId: string;
  engineId: string;
  provider: string;
  model: string;
  promptVersion?: string;
  policyVersion?: string;
  inputHash?: string;
  outputHash?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  estimatedCostUSD?: number;
  confidence?: number;
  evaluation?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[orvanta:telemetry] model execution was not persisted", {
      engineId: input.engineId,
      correlationId: input.correlationId,
    });
    return false;
  }

  const { error } = await supabase.from("model_execution_log").insert({
    tenant_id: input.tenantId,
    correlation_id: input.correlationId,
    engine_id: input.engineId,
    model_provider: input.provider,
    model_name: input.model,
    prompt_version: input.promptVersion || null,
    policy_version: input.policyVersion || null,
    input_hash: input.inputHash || null,
    output_hash: input.outputHash || null,
    input_tokens: input.inputTokens || null,
    output_tokens: input.outputTokens || null,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    estimated_cost_usd: input.estimatedCostUSD || null,
    confidence: input.confidence || null,
    evaluation: input.evaluation || {},
  });
  if (error) throw error;
  return true;
}

export async function getTelemetrySummary(tenantId: string, sinceHours = 24) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false, operations: 0, errors: 0, avgDurationMs: 0, aiCostUSD: 0 };
  const since = new Date(Date.now() - Math.max(1, sinceHours) * 60 * 60_000).toISOString();
  const [{ data: spans, error: spansError }, { data: modelRuns, error: modelError }] = await Promise.all([
    supabase.from("operational_telemetry").select("status,duration_ms").eq("tenant_id", tenantId).gte("created_at", since).limit(10_000),
    supabase.from("model_execution_log").select("estimated_cost_usd").eq("tenant_id", tenantId).gte("created_at", since).limit(10_000),
  ]);
  if (spansError) throw spansError;
  if (modelError) throw modelError;
  const durations = (spans || []).map((item) => Number(item.duration_ms || 0));
  return {
    configured: true,
    operations: durations.length,
    errors: (spans || []).filter((item) => item.status === "ERROR").length,
    avgDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    aiCostUSD: Number((modelRuns || []).reduce((sum, item) => sum + Number(item.estimated_cost_usd || 0), 0).toFixed(4)),
  };
}
