/**
 * Opportunity radar: when it may raise a paid request, and which project a
 * radar request belongs to.
 *
 * Incident (24 Nov 2026): the Chairman rejected a 5,000 SAR radar request (no
 * liquidity, commercial registration suspended). The daily radar would have
 * raised the same idea again the next morning. Now:
 *   - while the CR is suspended, the radar raises no paid request at all;
 *   - after a rejection of the same idea it waits RADAR_REJECTION_COOLDOWN_DAYS,
 *     unless the request carries new evidence;
 *   - every radar request is linked to its own project (deterministic id).
 * Pure functions; the radar and the bridge do the I/O.
 */
import { createHash } from "node:crypto";
import { isArchived, isMonetarySpend, readSpendChain } from "./spendChain";

export const RADAR_REJECTION_COOLDOWN_DAYS = 30;
/** A CR-suspension statement stays in force this long unless an ACTIVE CR document is newer. */
export const CR_HOLD_LOOKBACK_DAYS = 180;
/** New evidence must say something real, not a placeholder. */
export const MIN_EVIDENCE_CHARS = 30;

type ApprovalLike = {
  id: string;
  title: string;
  amount?: number | null;
  status?: string;
  createdAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
  metadata?: Record<string, unknown> | null;
};

export type CrDocument = { status?: string | null; updated_at?: string | null; created_at?: string | null };

export type RadarGuard =
  | { allowed: true; code: null; reason: null }
  | { allowed: false; code: "CR_SUSPENDED" | "COOLDOWN" | "PENDING_SAME_IDEA"; reason: string; until: string | null; basedOn: string | null };

const CR_SUSPENDED = /(?:السجل(?:\s+التجاري)?|سجل\s+تجاري)[^.\n]{0,24}(?:مُ?علّ?ق|مُ?وقوف|متوقف|إيقاف|تعليق)|(?:تعليق|إيقاف|وقف)\s+(?:ال)?سجل|\bCR\b[^.\n]{0,16}suspend|suspended\s+(?:CR|commercial registration)|commercial registration[^.\n]{0,16}suspend/i;

export function mentionsCrSuspension(text: string): boolean {
  return CR_SUSPENDED.test(text || "");
}

export function isRadarApproval(item: ApprovalLike): boolean {
  const meta = item.metadata || {};
  return meta.actionKind === "OPPORTUNITY_RADAR_PILOT" || meta.entityType === "opportunity_radar_runs";
}

export function radarRunId(item: ApprovalLike): string | null {
  const meta = item.metadata || {};
  return meta.entityType === "opportunity_radar_runs" && typeof meta.entityId === "string" && meta.entityId ? meta.entityId : null;
}

function normalize(text: string): string {
  return String(text || "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/^.*?رادار الفرص\s*[:：]\s*/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

/** The idea a radar request is about: its opportunity title, else its own title without the radar prefix. */
export function radarIdea(item: ApprovalLike): string {
  const opportunity = (item.metadata?.opportunity || {}) as Record<string, unknown>;
  return normalize(String(opportunity.title || opportunity.opportunity_name || item.title || ""));
}

function textOf(item: ApprovalLike): string {
  const chain = readSpendChain(item as never);
  const meta = item.metadata || {};
  const owner = (meta.ownerDecision || {}) as Record<string, unknown>;
  return [
    item.note, owner.words,
    chain?.financeReview?.note, chain?.governanceReview?.note, chain?.sultanRecommendation?.note,
  ].filter(Boolean).join(" \n ");
}

function decidedAt(item: ApprovalLike): number {
  return Date.parse(item.decidedAt || item.createdAt || "") || 0;
}

/** The newest rejection that states the CR is suspended, unless an ACTIVE CR document is newer. */
export function crHold(approvals: ApprovalLike[], crDocuments: CrDocument[], now = new Date()): { since: string; basedOn: string } | null {
  const docs = crDocuments.map((doc) => ({ status: String(doc.status || "").toUpperCase(), at: Date.parse(doc.updated_at || doc.created_at || "") || 0 }));
  const newestDoc = docs.sort((a, b) => b.at - a.at)[0];
  const since = now.getTime() - CR_HOLD_LOOKBACK_DAYS * 86_400_000;
  const statement = approvals
    .filter((item) => item.status === "REJECTED" && decidedAt(item) >= since && mentionsCrSuspension(textOf(item)))
    .sort((a, b) => decidedAt(b) - decidedAt(a))[0];
  if (newestDoc && ["SUSPENDED", "EXPIRED", "CANCELLED", "CANCELED"].includes(newestDoc.status)) {
    return { since: new Date(newestDoc.at || now.getTime()).toISOString(), basedOn: "gov_documents" };
  }
  if (!statement) return null;
  if (newestDoc && newestDoc.status === "ACTIVE" && newestDoc.at > decidedAt(statement)) return null;
  return { since: new Date(decidedAt(statement)).toISOString(), basedOn: statement.id };
}

/**
 * May the radar raise a paid request for this idea now?
 * The CR hold is absolute; the cooldown yields only to new evidence.
 */
export function radarSpendGuard(input: {
  approvals: ApprovalLike[];
  idea: string;
  amountSAR: number;
  evidence?: string;
  crDocuments?: CrDocument[];
  now?: Date;
}): RadarGuard {
  const now = input.now || new Date();
  if (!isMonetarySpend(input.amountSAR)) return { allowed: true, code: null, reason: null };
  const hold = crHold(input.approvals, input.crDocuments || [], now);
  if (hold) {
    return {
      allowed: false, code: "CR_SUSPENDED", until: null, basedOn: hold.basedOn,
      reason: "السجل التجاري معلّق: لا يرفع الرادار أي طلب صرف مدفوع حتى يُرفع التعليق ويُسجَّل السجل سارياً.",
    };
  }
  const idea = normalize(input.idea);
  const radar = input.approvals.filter((item) => isRadarApproval(item) && radarIdea(item) === idea);
  const open = radar.find((item) => (item.status === "PENDING" || item.status === "DEFERRED") && !isArchived(item as never));
  if (open) {
    return { allowed: false, code: "PENDING_SAME_IDEA", until: null, basedOn: open.id, reason: "طلب صرف لنفس الفكرة ما زال في السلسلة؛ لا يُرفع طلب ثانٍ." };
  }
  const cutoff = now.getTime() - RADAR_REJECTION_COOLDOWN_DAYS * 86_400_000;
  const rejected = radar.filter((item) => item.status === "REJECTED" && decidedAt(item) >= cutoff).sort((a, b) => decidedAt(b) - decidedAt(a))[0];
  const evidence = String(input.evidence || "").trim();
  if (rejected && evidence.length < MIN_EVIDENCE_CHARS) {
    const until = new Date(decidedAt(rejected) + RADAR_REJECTION_COOLDOWN_DAYS * 86_400_000).toISOString();
    return {
      allowed: false, code: "COOLDOWN", until, basedOn: rejected.id,
      reason: `رُفض طلب صرف لنفس الفكرة؛ لا يُعاد رفعه قبل ${until.slice(0, 10)} إلا بأدلة جديدة.`,
    };
  }
  return { allowed: true, code: null, reason: null };
}

/** One project per radar run, with a stable id so linking is idempotent. */
export function radarProjectId(runId: string): string {
  const hex = createHash("sha256").update(`orvanta:radar-project:${runId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

/** Project status that mirrors the decision on its radar request. */
export function radarProjectStatus(approvalStatus: string | undefined): { status: string; approval_status: string } {
  if (approvalStatus === "APPROVED") return { status: "ACTIVE", approval_status: "APPROVED" };
  if (approvalStatus === "REJECTED") return { status: "REJECTED", approval_status: "REJECTED" };
  return { status: "PROPOSED", approval_status: "PENDING" };
}
