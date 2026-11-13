/**
 * Append-only event log for work items (commands, spend requests, decisions).
 *
 * Every state transition writes one line: who, when, from which state to which,
 * the note and the evidence. Rows are never updated or deleted (a trigger in
 * the migration refuses it). Employee KPIs are computed from this log, never
 * typed in by hand.
 */
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";

export type WorkEvent = {
  id: string;
  entityType: "command" | "spend" | "decision" | "message";
  entityId: string;
  actor: string;
  action: string;
  fromState: string | null;
  toState: string | null;
  note: string;
  evidence: string | null;
  at: string;
};

const memory: WorkEvent[] = [];

function missingTable(error: { code?: string; message?: string } | null) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(text);
}

function newId() {
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Best effort by design: a missing log table must never block the work itself. */
export async function appendWorkEvent(input: Omit<WorkEvent, "id" | "at"> & { at?: string }): Promise<WorkEvent> {
  const event: WorkEvent = { ...input, id: newId(), at: input.at || new Date().toISOString(), note: input.note.slice(0, 4_000), evidence: input.evidence ? input.evidence.slice(0, 8_000) : null };
  memory.unshift(event);
  if (memory.length > 2_000) memory.length = 2_000;
  const client = getSupabaseAdmin();
  if (!client) return event;
  try {
    const { error } = await client.from("orvanta_work_events").insert({
      id: event.id,
      tenant_id: getTenantId(),
      entity_type: event.entityType,
      entity_id: event.entityId,
      actor: event.actor,
      action: event.action,
      from_state: event.fromState,
      to_state: event.toState,
      note: event.note,
      evidence: event.evidence,
      at: event.at,
    });
    if (error && !missingTable(error)) console.warn("[orvanta:work-events] append failed", { code: error.code });
  } catch (error) {
    console.warn("[orvanta:work-events] append threw", { message: error instanceof Error ? error.message : String(error) });
  }
  return event;
}

/** Recent events from the database (falls back to this instance's memory). */
export async function readWorkEvents(options: { sinceIso?: string; limit?: number } = {}): Promise<WorkEvent[]> {
  const limit = Math.min(options.limit || 1_000, 2_000);
  const client = getSupabaseAdmin();
  if (client) {
    let query = client.from("orvanta_work_events").select("*").eq("tenant_id", getTenantId()).order("at", { ascending: false }).limit(limit);
    if (options.sinceIso) query = query.gte("at", options.sinceIso);
    const { data, error } = await query;
    if (!error && data) {
      return data.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        entityType: String(row.entity_type) as WorkEvent["entityType"],
        entityId: String(row.entity_id),
        actor: String(row.actor),
        action: String(row.action),
        fromState: row.from_state == null ? null : String(row.from_state),
        toState: row.to_state == null ? null : String(row.to_state),
        note: String(row.note || ""),
        evidence: row.evidence == null ? null : String(row.evidence),
        at: String(row.at),
      }));
    }
  }
  const since = options.sinceIso ? Date.parse(options.sinceIso) : -Infinity;
  return memory.filter((event) => Date.parse(event.at) >= since).slice(0, limit);
}

export function _clearWorkEvents() {
  memory.length = 0;
}
