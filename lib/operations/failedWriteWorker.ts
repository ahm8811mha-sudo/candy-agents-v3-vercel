import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";

const REPLAYABLE_TABLES = new Set([
  "tasks",
  "projects",
  "company_tasks",
  "notifications",
  "activity_logs",
  "government_documents",
  "government_document_extractions",
  "government_requests",
  "agent_memory",
  "crm_leads",
  "crm_contacts",
]);

function retryAt(attempt: number) {
  const delaysMinutes = [1, 5, 15, 60, 240];
  const minutes = delaysMinutes[Math.min(Math.max(attempt - 1, 0), delaysMinutes.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function containsRedaction(value: unknown): boolean {
  if (value === "[REDACTED]") return true;
  if (Array.isArray(value)) return value.some(containsRedaction);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(containsRedaction);
  return false;
}

async function sendToDeadLetter(row: Record<string, unknown>, message: string, attempts: number) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const tenantId = String(row.tenant_id || "golden-star");
  const sourceId = String(row.id);
  const { error } = await supabase.from("dead_letter_jobs").upsert({
    tenant_id: tenantId,
    source_type: "failed_write",
    source_id: sourceId,
    operation: String(row.operation || "UPSERT"),
    payload: row.payload || {},
    error_message: message.slice(0, 2000),
    attempts,
    status: "OPEN",
    last_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,source_type,source_id" });
  if (error) throw error;
}

async function replayRow(row: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is unavailable.");

  const table = String(row.table_name || "");
  const operation = String(row.operation || "UPSERT").toUpperCase();
  const payload = (row.payload || {}) as Record<string, unknown>;
  if (!REPLAYABLE_TABLES.has(table)) throw new Error(`Table ${table} is not approved for automatic replay.`);
  if (operation !== "UPSERT") throw new Error(`Operation ${operation} requires a domain-specific recovery handler.`);
  if (!payload.id) throw new Error("Replay payload does not contain an idempotent id.");
  if (containsRedaction(payload)) throw new Error("Replay payload contains redacted values and requires manual recovery.");

  const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function processFailedWrites(input: { tenantId: string; limit?: number }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for failed-write recovery.");
  const workerId = `failed-write-worker:${randomUUID()}`;
  const { data, error } = await supabase.rpc("orvanta_claim_failed_writes", {
    p_tenant_id: input.tenantId,
    p_worker_id: workerId,
    p_limit: Math.min(Math.max(input.limit || 25, 1), 100),
  });
  if (error) throw error;

  let resolved = 0;
  let retried = 0;
  let deadLettered = 0;
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const row of (data || []) as Record<string, unknown>[]) {
    const id = String(row.id);
    const attempts = Number(row.attempts || 0) + 1;
    const maxAttempts = Math.max(1, Number(row.max_attempts || 5));
    try {
      await replayRow(row);
      const { error: updateError } = await supabase.from("failed_writes").update({
        status: "RESOLVED",
        attempts,
        resolved_at: new Date().toISOString(),
        claimed_at: null,
        claimed_by: null,
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("claimed_by", workerId);
      if (updateError) throw updateError;
      resolved += 1;
      results.push({ id, status: "RESOLVED" });
    } catch (cause) {
      const message = errorMessage(cause).slice(0, 2000);
      const terminal = attempts >= maxAttempts || message.includes("manual recovery") || message.includes("not approved");
      if (terminal) {
        await sendToDeadLetter(row, message, attempts);
        const { error: updateError } = await supabase.from("failed_writes").update({
          status: "DEAD_LETTER",
          attempts,
          error_message: message,
          claimed_at: null,
          claimed_by: null,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", id).eq("claimed_by", workerId);
        if (updateError) throw updateError;
        deadLettered += 1;
        results.push({ id, status: "DEAD_LETTER", error: message });
      } else {
        const { error: updateError } = await supabase.from("failed_writes").update({
          status: "PENDING",
          attempts,
          error_message: message,
          claimed_at: null,
          claimed_by: null,
          next_retry_at: retryAt(attempts),
          updated_at: new Date().toISOString(),
        }).eq("id", id).eq("claimed_by", workerId);
        if (updateError) throw updateError;
        retried += 1;
        results.push({ id, status: "RETRY", error: message });
      }
    }
  }

  return {
    selected: (data || []).length,
    resolved,
    retried,
    deadLettered,
    results,
  };
}
