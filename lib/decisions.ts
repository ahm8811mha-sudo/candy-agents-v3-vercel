/**
 * Review-action store.
 *
 * Generic decision log for ANY item surfaced in a department metric (approvals,
 * tasks, projects, risks, CEO follow-ups). A reviewer can approve, reject, add a
 * note, or forward an item to the relevant department. Each item is identified
 * by (sourceType, sourceId); the latest action represents its current state.
 *
 * In-memory (consistent with cache/rateLimit/approvals). Durable persistence via
 * Supabase is a follow-up.
 */

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
  return record;
}

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
