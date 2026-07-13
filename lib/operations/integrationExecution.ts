import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";

export type IntegrationExecutionResult<T> = {
  value: T;
  attemptId: string;
  idempotent: boolean;
  receiptId?: string;
};

type ExecuteIntegrationInput<T> = {
  tenantId: string;
  integration: string;
  operation: string;
  idempotencyKey: string;
  request?: unknown;
  maxAttempts?: number;
  execute: () => Promise<{
    value: T;
    externalId?: string;
    externalUrl?: string;
    responseCode?: number;
    receipt?: Record<string, unknown>;
    receiptType?: string;
  }>;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function requestHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function retryAt(attempt: number) {
  const delaysMinutes = [1, 5, 15, 60, 240, 720];
  const minutes = delaysMinutes[Math.min(Math.max(attempt - 1, 0), delaysMinutes.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && String((error as { code?: unknown }).code || "") === "23505");
}

async function loadCompletedExecution<T>(input: ExecuteIntegrationInput<T>) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for external integration execution.");

  const existing = await supabase
    .from("integration_attempts")
    .select("id,status,response_metadata")
    .eq("tenant_id", input.tenantId)
    .eq("integration", input.integration)
    .eq("operation", input.operation)
    .eq("idempotency_key", input.idempotencyKey)
    .in("status", ["SUCCEEDED", "SKIPPED"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return null;

  const receipt = await supabase
    .from("external_receipts")
    .select("id,receipt")
    .eq("tenant_id", input.tenantId)
    .eq("integration", input.integration)
    .eq("operation", input.operation)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (receipt.error) throw receipt.error;

  return {
    value: ((receipt.data?.receipt as Record<string, unknown> | null)?.value ?? existing.data.response_metadata) as T,
    attemptId: String(existing.data.id),
    receiptId: receipt.data?.id ? String(receipt.data.id) : undefined,
    idempotent: true,
  } satisfies IntegrationExecutionResult<T>;
}

export async function executeIntegrationOnce<T>(input: ExecuteIntegrationInput<T>): Promise<IntegrationExecutionResult<T>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for external integration execution.");

  const completed = await loadCompletedExecution(input);
  if (completed) return completed;

  const previous = await supabase
    .from("integration_attempts")
    .select("attempt_number")
    .eq("tenant_id", input.tenantId)
    .eq("integration", input.integration)
    .eq("operation", input.operation)
    .eq("idempotency_key", input.idempotencyKey)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous.error) throw previous.error;

  const attemptNumber = Number(previous.data?.attempt_number || 0) + 1;
  const maxAttempts = Math.max(1, input.maxAttempts || 6);
  const attemptId = randomUUID();
  const hash = requestHash(input.request || {});
  const startedAt = new Date().toISOString();

  const inserted = await supabase.from("integration_attempts").insert({
    id: attemptId,
    tenant_id: input.tenantId,
    integration: input.integration,
    operation: input.operation,
    idempotency_key: input.idempotencyKey,
    request_hash: hash,
    attempt_number: attemptNumber,
    status: "STARTED",
    request_metadata: input.request || {},
    started_at: startedAt,
    updated_at: startedAt,
  });
  if (inserted.error) {
    if (isUniqueViolation(inserted.error)) {
      const reused = await loadCompletedExecution(input);
      if (reused) return reused;
      throw new Error("The same external operation is already in progress. Retry after the active attempt completes.");
    }
    throw inserted.error;
  }

  try {
    const execution = await input.execute();
    const completedAt = new Date().toISOString();
    const receiptPayload = {
      value: execution.value as unknown,
      requestHash: hash,
      attemptNumber,
      completedAt,
      ...(execution.receipt || {}),
    };

    const completedAttempt = await supabase.rpc("orvanta_complete_integration_attempt", {
      p_attempt_id: attemptId,
      p_tenant_id: input.tenantId,
      p_external_id: execution.externalId || "",
      p_external_url: execution.externalUrl || "",
      p_response_code: execution.responseCode || 200,
      p_receipt_type: execution.receiptType || "API_RESPONSE",
      p_receipt: receiptPayload,
    });
    if (completedAttempt.error) throw completedAttempt.error;

    const completion = (completedAttempt.data || {}) as { receipt_id?: unknown; idempotent?: unknown };
    return {
      value: execution.value,
      attemptId,
      receiptId: completion.receipt_id ? String(completion.receipt_id) : undefined,
      idempotent: completion.idempotent === true,
    };
  } catch (cause) {
    const message = errorMessage(cause).slice(0, 2000);
    const terminal = attemptNumber >= maxAttempts;
    const completedAt = new Date().toISOString();
    const update = await supabase.from("integration_attempts").update({
      status: terminal ? "DEAD_LETTER" : "RETRY",
      error_message: message,
      completed_at: completedAt,
      next_retry_at: terminal ? null : retryAt(attemptNumber),
      updated_at: completedAt,
    }).eq("id", attemptId).eq("status", "STARTED");
    if (update.error) {
      console.error("[orvanta:integration] failed to record integration failure", {
        attemptId,
        originalError: message,
        recorderError: update.error.message,
      });
    }

    if (terminal) {
      const deadLetter = await supabase.from("dead_letter_jobs").upsert({
        tenant_id: input.tenantId,
        source_type: "integration_attempt",
        source_id: attemptId,
        operation: `${input.integration}:${input.operation}`,
        payload: input.request || {},
        error_message: message,
        attempts: attemptNumber,
        status: "OPEN",
        last_attempt_at: completedAt,
        updated_at: completedAt,
      }, { onConflict: "tenant_id,source_type,source_id" });
      if (deadLetter.error) {
        console.error("[orvanta:integration] failed to create dead letter", {
          attemptId,
          error: deadLetter.error.message,
        });
      }
    }
    throw cause;
  }
}
