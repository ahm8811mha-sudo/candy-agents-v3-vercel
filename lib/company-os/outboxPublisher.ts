import { getSupabaseAdmin } from "../supabase";
import { signWebhookBody } from "../company/webhooks";
import { executeIntegrationOnce } from "../operations/integrationExecution";
import { eventToOutboxRecord, nextRetryAt } from "./events";
import type { CompanyEvent } from "./types";

export type OutboxDeliveryResult = {
  id: string;
  status: "PUBLISHED" | "RETRY" | "DEAD_LETTER" | "SKIPPED";
  attempts: number;
  error?: string;
  integrationAttemptId?: string;
  receiptId?: string;
};

export async function appendCompanyEvent(event: CompanyEvent) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for company events.");

  const record = eventToOutboxRecord(event);
  const { error: rpcError } = await supabase.rpc("orvanta_append_event", {
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
    p_outbox: record,
  });

  if (!rpcError) return record;

  // Compatibility fallback for deployments where the SQL function has not yet
  // been installed. The readiness gate remains red until the RPC is available.
  const { error: eventError } = await supabase.from("company_events").upsert({
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
  });
  if (eventError) throw eventError;
  const { error: outboxError } = await supabase.from("event_outbox").upsert(record);
  if (outboxError) throw outboxError;
  return record;
}

function webhookConfig() {
  const url = process.env.ORVANTA_WEBHOOK_URL?.trim();
  const secret = process.env.ORVANTA_WEBHOOK_SECRET || process.env.API_SECRET_KEY;
  return { url, secret };
}

async function rawWebhookDelivery(row: Record<string, unknown>) {
  const { url, secret } = webhookConfig();
  if (!url) return { skipped: true, responseStatus: 204, externalUrl: undefined as string | undefined };

  const body = JSON.stringify({
    id: row.id,
    event: row.event_type,
    tenantId: row.tenant_id,
    aggregate: { type: row.aggregate_type, id: row.aggregate_id },
    correlationId: row.correlation_id,
    causationId: row.causation_id || null,
    payload: row.payload || {},
    timestamp: new Date().toISOString(),
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-orvanta-event": String(row.event_type),
    "x-orvanta-delivery": String(row.id),
    "x-orvanta-tenant": String(row.tenant_id),
  };
  if (secret) headers["x-orvanta-signature"] = signWebhookBody(body, secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    return { skipped: false, responseStatus: response.status, externalUrl: url };
  } finally {
    clearTimeout(timeout);
  }
}

async function deliver(row: Record<string, unknown>) {
  const tenantId = String(row.tenant_id || "golden-star");
  const idempotencyKey = `outbox:${String(row.id)}`;
  return executeIntegrationOnce({
    tenantId,
    integration: "ORVANTA_WEBHOOK",
    operation: "event.publish",
    idempotencyKey,
    request: {
      outboxId: row.id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      correlationId: row.correlation_id,
    },
    maxAttempts: 8,
    execute: async () => {
      const delivery = await rawWebhookDelivery(row);
      return {
        value: delivery,
        externalId: String(row.id),
        externalUrl: delivery.externalUrl,
        responseCode: delivery.responseStatus,
        receiptType: delivery.skipped ? "DISABLED_INTEGRATION" : "WEBHOOK_RESPONSE",
        receipt: {
          skipped: delivery.skipped,
          responseStatus: delivery.responseStatus,
          eventType: row.event_type,
        },
      };
    },
  });
}

export async function publishOutboxBatch(options: { tenantId?: string; limit?: number } = {}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for outbox publishing.");
  if (process.env.ORVANTA_OUTBOX_ENABLED !== "true") {
    throw new Error("Outbox publisher is disabled. Set ORVANTA_OUTBOX_ENABLED=true after applying the core schema.");
  }

  const now = new Date().toISOString();
  let query = supabase
    .from("event_outbox")
    .select("*")
    .in("status", ["PENDING", "RETRY"])
    .lte("available_at", now)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(options.limit || 25, 1), 100));
  if (options.tenantId) query = query.eq("tenant_id", options.tenantId);
  const { data, error } = await query;
  if (error) throw error;

  const results: OutboxDeliveryResult[] = [];
  for (const row of data || []) {
    const attempts = Number(row.attempts || 0) + 1;
    const { data: claimed, error: claimError } = await supabase
      .from("event_outbox")
      .update({ status: "PUBLISHING", attempts, updated_at: now })
      .eq("id", row.id)
      .eq("tenant_id", row.tenant_id)
      .in("status", ["PENDING", "RETRY"])
      .select("*")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const execution = await deliver(claimed);
      const delivery = execution.value as { skipped: boolean; responseStatus: number };
      const update = await supabase
        .from("event_outbox")
        .update({
          status: "PUBLISHED",
          published_at: new Date().toISOString(),
          last_error: null,
          delivery_result: {
            ...delivery,
            integrationAttemptId: execution.attemptId,
            receiptId: execution.receiptId || null,
            idempotent: execution.idempotent,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id)
        .eq("tenant_id", claimed.tenant_id);
      if (update.error) throw update.error;
      results.push({
        id: String(claimed.id),
        status: delivery.skipped ? "SKIPPED" : "PUBLISHED",
        attempts,
        integrationAttemptId: execution.attemptId,
        receiptId: execution.receiptId,
      });
    } catch (deliveryError) {
      const terminal = attempts >= 8;
      const message = deliveryError instanceof Error ? deliveryError.message.slice(0, 1500) : String(deliveryError).slice(0, 1500);
      const update = await supabase
        .from("event_outbox")
        .update({
          status: terminal ? "DEAD_LETTER" : "RETRY",
          available_at: terminal ? claimed.available_at : nextRetryAt(attempts),
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id)
        .eq("tenant_id", claimed.tenant_id);
      if (update.error) throw update.error;
      results.push({ id: String(claimed.id), status: terminal ? "DEAD_LETTER" : "RETRY", attempts, error: message });
    }
  }

  return {
    selected: (data || []).length,
    processed: results.length,
    published: results.filter((item) => item.status === "PUBLISHED" || item.status === "SKIPPED").length,
    retried: results.filter((item) => item.status === "RETRY").length,
    deadLettered: results.filter((item) => item.status === "DEAD_LETTER").length,
    results,
  };
}
