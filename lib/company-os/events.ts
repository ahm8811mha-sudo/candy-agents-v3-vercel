import type { CompanyEvent } from "./types";

const SAFE_EVENT_TYPE = /^[a-z0-9]+(?:\.[a-z0-9_-]+)+$/;

export function createCompanyEvent<TPayload extends Record<string, unknown>>(input: {
  type: string;
  tenantId: string;
  actorId: string;
  actorType: CompanyEvent["actorType"];
  entityType: string;
  entityId: string;
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
}): CompanyEvent<TPayload> {
  if (!SAFE_EVENT_TYPE.test(input.type)) {
    throw new Error(`Invalid company event type: ${input.type}`);
  }
  if (!input.tenantId.trim()) throw new Error("tenantId is required for every company event.");
  if (!input.entityId.trim()) throw new Error("entityId is required for every company event.");

  const id = crypto.randomUUID();
  return {
    id,
    type: input.type,
    version: 1,
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorType: input.actorType,
    entityType: input.entityType,
    entityId: input.entityId,
    correlationId: input.correlationId || id,
    causationId: input.causationId,
    occurredAt: new Date().toISOString(),
    payload: input.payload,
  };
}

export type OutboxRecord = {
  id: string;
  tenant_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  correlation_id: string;
  causation_id?: string | null;
  payload: Record<string, unknown>;
  status: "PENDING" | "PUBLISHED" | "FAILED" | "DEAD_LETTER";
  attempts: number;
  available_at: string;
  created_at: string;
};

export function eventToOutboxRecord(event: CompanyEvent): OutboxRecord {
  return {
    id: event.id,
    tenant_id: event.tenantId,
    event_type: event.type,
    aggregate_type: event.entityType,
    aggregate_id: event.entityId,
    correlation_id: event.correlationId,
    causation_id: event.causationId || null,
    payload: event.payload,
    status: "PENDING",
    attempts: 0,
    available_at: event.occurredAt,
    created_at: event.occurredAt,
  };
}

export function nextRetryAt(attempts: number, now = Date.now()) {
  const baseMs = 1_000;
  const cappedAttempts = Math.min(Math.max(attempts, 0), 8);
  const jitter = Math.floor(Math.random() * 500);
  return new Date(now + baseMs * 2 ** cappedAttempts + jitter).toISOString();
}
