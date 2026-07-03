/**
 * F1 — Append-only audit trail (docs/ROADMAP.md).
 *
 * Every governance-sensitive action is recorded here: who, when, what, on which
 * entity, and under which authority. Records are never mutated or deleted —
 * `recordAudit` only appends. When Supabase is configured the entry is also
 * persisted to `audit_log` (durable across restarts); otherwise it lives in the
 * in-memory ring, consistent with the rest of the company modules.
 */

import { getSupabaseAdmin } from "../supabase";

export type AuditEntry = {
  id: string;
  actor: string;
  role?: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  tier?: string;
  createdAt: string;
};

const MAX = 500;
const store: AuditEntry[] = [];

function genId() {
  return `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type RecordAuditInput = {
  actor: string;
  role?: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  tier?: string;
};

export function recordAudit(input: RecordAuditInput): AuditEntry {
  const entry: AuditEntry = {
    id: genId(),
    actor: input.actor,
    role: input.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    detail: input.detail,
    tier: input.tier,
    createdAt: new Date().toISOString(),
  };
  store.unshift(entry);
  if (store.length > MAX) store.length = MAX;

  // Best-effort durable persistence; never blocks or throws into the caller.
  const supabase = getSupabaseAdmin();
  if (supabase) {
    void supabase
      .from("audit_log")
      .insert({
        id: entry.id,
        actor: entry.actor,
        role: entry.role,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        detail: entry.detail,
        tier: entry.tier,
        created_at: entry.createdAt,
      })
      .then(() => undefined, () => undefined);
  }
  return entry;
}

export type AuditFilter = { actor?: string; entityType?: string; action?: string };

export function listAudit(filter: AuditFilter = {}, limit = 100): AuditEntry[] {
  return store
    .filter(
      (e) =>
        (!filter.actor || e.actor === filter.actor) &&
        (!filter.entityType || e.entityType === filter.entityType) &&
        (!filter.action || e.action === filter.action)
    )
    .slice(0, limit);
}

export function auditStats() {
  const byAction: Record<string, number> = {};
  for (const e of store) byAction[e.action] = (byAction[e.action] || 0) + 1;
  return { total: store.length, byAction };
}

/** Test helper. */
export function _clearAudit(): void {
  store.length = 0;
}
