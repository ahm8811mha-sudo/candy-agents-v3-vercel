/**
 * F1 — Append-only audit trail (docs/ROADMAP.md).
 *
 * Every governance-sensitive action is recorded here: who, when, what, on which
 * entity, and under which authority. Records are never mutated or deleted —
 * `recordAudit` only appends. When Supabase is configured the entry is also
 * persisted to `audit_log` (durable across restarts); otherwise it lives in the
 * in-memory ring, consistent with the rest of the company modules.
 */

import { persist, persistCritical, fetchRows, hydrateOnce, hasSupabaseEnv } from "../supabase";

export type AuditEntry = {
  id: string;
  actor: string;
  role?: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  tier?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

const MAX = 500;
const store: AuditEntry[] = [];

function genId() {
  return `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type RecordAuditInput = {
  /** Optional stable id for retry-safe sign-off events. */
  id?: string;
  actor: string;
  role?: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  tier?: string;
  metadata?: Record<string, unknown>;
};

function buildEntry(input: RecordAuditInput): AuditEntry {
  return {
    id: input.id || genId(),
    actor: input.actor,
    role: input.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    detail: input.detail,
    tier: input.tier,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
}

function toRow(entry: AuditEntry): Record<string, unknown> {
  return {
    id: entry.id,
    actor: entry.actor,
    role: entry.role ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    detail: entry.detail,
    tier: entry.tier ?? null,
    metadata: entry.metadata ?? {},
    created_at: entry.createdAt,
  };
}

function addToStore(entry: AuditEntry) {
  if (store.some((existing) => existing.id === entry.id)) return;
  store.unshift(entry);
  if (store.length > MAX) store.length = MAX;
}

export function recordAudit(input: RecordAuditInput): AuditEntry {
  const entry = buildEntry(input);
  addToStore(entry);

  // Best-effort durable persistence; never blocks or throws into the caller.
  persist("audit_log", toRow(entry));
  return entry;
}

/** Durable audit write for governance and sign-off paths. */
export async function recordAuditCritical(input: RecordAuditInput): Promise<AuditEntry> {
  const entry = buildEntry(input);
  if (hasSupabaseEnv()) await persistCritical("audit_log", toRow(entry));
  addToStore(entry);
  return entry;
}

/** Hydrate the in-memory ring from Supabase once per process (before reads). */
export const hydrateAudit = hydrateOnce(async () => {
  const rows = await fetchRows("audit_log", { orderBy: "created_at", limit: MAX });
  const seen = new Set(store.map((e) => e.id));
  for (const r of rows) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    store.push({
      id,
      actor: String(r.actor),
      role: r.role ? String(r.role) : undefined,
      action: String(r.action),
      entityType: String(r.entity_type ?? ""),
      entityId: String(r.entity_id ?? ""),
      detail: String(r.detail ?? ""),
      tier: r.tier ? String(r.tier) : undefined,
      metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
      createdAt: String(r.created_at),
    });
  }
  store.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (store.length > MAX) store.length = MAX;
});

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

/** Compatibility projection for the enterprise consoles while they move to AuditEntry. */
export function toLegacyDecisionAuditRow(entry: Record<string, unknown>) {
  const metadata = (entry.metadata as Record<string, unknown> | null) || {};
  const action = String(entry.action || "");
  return {
    ...entry,
    decision_type: String(metadata.decisionType || action.split(":", 1)[0] || "AUDIT"),
    actor_role: String(entry.role || entry.actor || "SYSTEM"),
    approval_status: String(metadata.approvalStatus || "RECORDED"),
    immutable_note: String(entry.detail || ""),
  };
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
