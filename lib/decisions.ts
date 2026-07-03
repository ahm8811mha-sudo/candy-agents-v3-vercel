/**
 * Review-action store.
 *
 * Generic decision log for ANY item surfaced in a department metric (approvals,
 * tasks, projects, risks, CEO follow-ups). A reviewer can approve, reject, add a
 * note, or forward an item to the relevant department. Each item is identified
 * by (sourceType, sourceId); the latest action represents its current state.
 *
 * In-memory working copy with best-effort write-through + hydrate to the
 * Supabase `company_decisions` table (see hydrateDecisions) when configured.
 */

import { persist, fetchRows, hydrateOnce } from "./supabase";

export type DecisionAction = "APPROVED" | "REJECTED" | "NOTED" | "FORWARDED";

export type DecisionRecord = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  action: DecisionAction;
  note?: string;
  forwardedTo?: string;
  decidedBy: string;
  createdAt: string;
};

const store: DecisionRecord[] = [];

function genId() {
  return `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type RecordDecisionInput = {
  sourceType: string;
  sourceId: string;
  title: string;
  action: DecisionAction;
  note?: string;
  forwardedTo?: string;
  decidedBy?: string;
};

export function recordDecision(input: RecordDecisionInput): DecisionRecord {
  const record: DecisionRecord = {
    id: genId(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    action: input.action,
    note: input.note,
    forwardedTo: input.forwardedTo,
    decidedBy: input.decidedBy || "CEO",
    createdAt: new Date().toISOString(),
  };
  store.unshift(record);
  persist("company_decisions", {
    id: record.id,
    source_type: record.sourceType,
    source_id: record.sourceId,
    title: record.title,
    action: record.action,
    note: record.note ?? null,
    forwarded_to: record.forwardedTo ?? null,
    decided_by: record.decidedBy,
    created_at: record.createdAt,
  });
  return record;
}

/** Hydrate the store from Supabase once per process (before reads). */
export const hydrateDecisions = hydrateOnce(async () => {
  const rows = await fetchRows("company_decisions", { orderBy: "created_at", limit: 200 });
  const seen = new Set(store.map((d) => d.id));
  for (const r of rows) {
    if (seen.has(String(r.id))) continue;
    store.push({
      id: String(r.id),
      sourceType: String(r.source_type),
      sourceId: String(r.source_id),
      title: String(r.title ?? ""),
      action: r.action as DecisionAction,
      note: r.note ? String(r.note) : undefined,
      forwardedTo: r.forwarded_to ? String(r.forwarded_to) : undefined,
      decidedBy: String(r.decided_by ?? "CEO"),
      createdAt: String(r.created_at),
    });
  }
  store.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

export function listDecisions(sourceType?: string): DecisionRecord[] {
  const items = sourceType ? store.filter((d) => d.sourceType === sourceType) : store;
  return items.slice(0, 200);
}

function key(sourceType: string, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

/** Latest decision for a specific item, or null. */
export function getDecision(sourceType: string, sourceId: string): DecisionRecord | null {
  return store.find((d) => d.sourceType === sourceType && d.sourceId === sourceId) || null;
}

/** Map of `${sourceType}:${sourceId}` → latest decision, for quick UI lookups. */
export function decisionMap(sourceType?: string): Record<string, DecisionRecord> {
  const map: Record<string, DecisionRecord> = {};
  for (const record of store) {
    if (sourceType && record.sourceType !== sourceType) continue;
    const k = key(record.sourceType, record.sourceId);
    // store is newest-first, so the first seen per key is the latest.
    if (!map[k]) map[k] = record;
  }
  return map;
}

export function decisionStats(): Record<DecisionAction, number> {
  return {
    APPROVED: store.filter((d) => d.action === "APPROVED").length,
    REJECTED: store.filter((d) => d.action === "REJECTED").length,
    NOTED: store.filter((d) => d.action === "NOTED").length,
    FORWARDED: store.filter((d) => d.action === "FORWARDED").length,
  };
}

/** Test helper. */
export function _clearDecisions(): void {
  store.length = 0;
}
