/**
 * Roadmap #1 — Realtime-lite change feed.
 *
 * A tiny version cursor the UI polls every few seconds instead of refetching
 * whole datasets: the fingerprint changes whenever any governed store mutates,
 * and only then does the client refetch. This delivers live-feeling updates
 * with ~100-byte polls and no extra keys; swapping the transport for Supabase
 * Realtime later only replaces the hook, not the consumers.
 */

import { listApprovals } from "../approvals";
import { listDecisions } from "../decisions";
import { listIdeas } from "./ideas";
import { listAudit } from "./audit";

export type FeedCursor = {
  /** Opaque fingerprint — clients compare, never parse. */
  version: string;
  pending: number;
  at: string;
};

export function getFeedCursor(): FeedCursor {
  const approvals = listApprovals();
  const decisions = listDecisions();
  const ideas = listIdeas();
  const audit = listAudit({}, 1);

  const latest = [
    approvals[0]?.createdAt,
    approvals.find((a) => a.decidedAt)?.decidedAt,
    decisions[0]?.createdAt,
    ideas[0]?.createdAt,
    audit[0]?.createdAt,
  ]
    .filter(Boolean)
    .sort()
    .pop();

  const pending = approvals.filter((a) => a.status === "PENDING").length;
  return {
    version: `${approvals.length}.${decisions.length}.${ideas.length}.${pending}.${latest || "0"}`,
    pending,
    at: new Date().toISOString(),
  };
}
