/**
 * The Executive Secretariat (رئيس الديوان — Chief of Staff).
 *
 * A decision that is approved or forwarded used to be logged and then lost:
 * no owner, no due date, no one chasing it to completion. This office closes
 * that loop. The moment a decision is issued it becomes a tracked commitment
 * with an owner and a deadline; the daily sweep chases the overdue ones and
 * escalates the stuck ones to the owner.
 *
 * Honest closure: the secretariat chases, reminds, and escalates — but it does
 * NOT mark a commitment done itself. Completion is recorded by the responsible
 * party (and, for real-world commitments, requires proof), the same principle
 * as the execution-honesty gate. The office guards the loop; it never fakes it.
 */

import { getSupabaseAdmin } from "../supabase";
import { recordAudit } from "./audit";
import { getAgent } from "./agents";

const DEFAULT_TENANT = "golden-star";
const DEFAULT_DUE_DAYS = 3;

export type CommitmentStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "CANCELLED";
export type CommitmentPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DecisionCommitment = {
  id: string;
  decisionId: string | null;
  sourceType: string;
  sourceId: string;
  title: string;
  detail: string | null;
  status: CommitmentStatus;
  priority: CommitmentPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  decidedBy: string | null;
  dueAt: string | null;
  reminderCount: number;
  escalated: boolean;
  requiresProof: boolean;
  completedAt: string | null;
  completionNote: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  createdAt: string;
  overdue: boolean;
  needsOwner: boolean;
};

export type OpenCommitmentInput = {
  decisionId?: string;
  sourceType: string;
  sourceId: string;
  title: string;
  detail?: string;
  priority?: CommitmentPriority;
  assigneeId?: string;
  assigneeName?: string;
  decidedBy?: string;
  dueInDays?: number;
  dueAt?: string;
  requiresProof?: boolean;
};

function isOverdue(row: { status?: string; due_at?: string | null }): boolean {
  if (!row.due_at) return false;
  if (["COMPLETED", "CANCELLED"].includes(String(row.status))) return false;
  return new Date(row.due_at).getTime() < Date.now();
}

function mapRow(row: Record<string, unknown>): DecisionCommitment {
  return {
    id: String(row.id),
    decisionId: row.decision_id ? String(row.decision_id) : null,
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    title: String(row.title),
    detail: row.detail ? String(row.detail) : null,
    status: String(row.status) as CommitmentStatus,
    priority: String(row.priority || "MEDIUM") as CommitmentPriority,
    assigneeId: row.assignee_id ? String(row.assignee_id) : null,
    assigneeName: row.assignee_name ? String(row.assignee_name) : null,
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    reminderCount: Number(row.reminder_count || 0),
    escalated: Boolean(row.escalated),
    requiresProof: Boolean(row.requires_proof),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    completionNote: row.completion_note ? String(row.completion_note) : null,
    linkedEntityType: row.linked_entity_type ? String(row.linked_entity_type) : null,
    linkedEntityId: row.linked_entity_id ? String(row.linked_entity_id) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    overdue: isOverdue(row as { status?: string; due_at?: string | null }),
    needsOwner: !row.assignee_id && !row.assignee_name,
  };
}

/**
 * The secretariat catches a decision. If no owner was named, the commitment is
 * still opened (status OPEN, needsOwner) so it can never be lost — the office
 * surfaces it for assignment rather than dropping it.
 */
export async function openDecisionCommitment(
  input: OpenCommitmentInput,
  options: { tenantId?: string; actor?: string } = {}
): Promise<{ ok: boolean; commitment: DecisionCommitment | null; reason?: string }> {
  const tenantId = options.tenantId || DEFAULT_TENANT;
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, commitment: null, reason: "متابعة القرارات تتطلب اتصال Supabase." };
  if (!input.title?.trim() || !input.sourceType || !input.sourceId) {
    return { ok: false, commitment: null, reason: "يلزم عنوان القرار ومصدره." };
  }

  const agent = input.assigneeId ? getAgent(input.assigneeId) : undefined;
  const assigneeName = input.assigneeName || agent?.name || null;
  const assigneeId = input.assigneeId || null;
  const dueAt = input.dueAt
    ? new Date(input.dueAt).toISOString()
    : new Date(Date.now() + Math.max(input.dueInDays || DEFAULT_DUE_DAYS, 1) * 86_400_000).toISOString();
  const status: CommitmentStatus = assigneeId || assigneeName ? "ASSIGNED" : "OPEN";

  // One open commitment per decision (idempotent via the partial unique index).
  const { data, error } = await supabase
    .from("decision_commitments")
    .upsert(
      {
        tenant_id: tenantId,
        decision_id: input.decisionId || null,
        source_type: input.sourceType,
        source_id: input.sourceId,
        title: input.title.trim(),
        detail: input.detail?.trim() || null,
        status,
        priority: input.priority || "MEDIUM",
        assignee_id: assigneeId,
        assignee_name: assigneeName,
        decided_by: input.decidedBy || null,
        due_at: dueAt,
        requires_proof: Boolean(input.requiresProof),
        created_by: "diwan",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,source_type,source_id" }
    )
    .select()
    .single();
  if (error) return { ok: false, commitment: null, reason: error.message };

  const commitment = mapRow(data);
  recordAudit({
    actor: options.actor || "diwan",
    action: "DECISION_COMMITMENT_OPENED",
    entityType: "decision_commitment",
    entityId: commitment.id,
    detail: `التقط الديوان القرار «${commitment.title}» وأسنده إلى ${commitment.assigneeName || "بانتظار تعيين مسؤول"}، الاستحقاق ${new Date(dueAt).toLocaleDateString("ar-SA")}.`,
  });
  return { ok: true, commitment };
}

export async function listDecisionCommitments(
  options: { tenantId?: string; includeClosed?: boolean } = {}
): Promise<DecisionCommitment[]> {
  const tenantId = options.tenantId || DEFAULT_TENANT;
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let query = supabase.from("decision_commitments").select("*").eq("tenant_id", tenantId);
  if (!options.includeClosed) query = query.not("status", "in", "(COMPLETED,CANCELLED)");
  const { data, error } = await query.order("due_at", { ascending: true }).limit(300);
  if (error) return [];
  return (data || []).map(mapRow);
}

export type AdvanceInput = {
  id: string;
  status?: CommitmentStatus;
  assigneeId?: string;
  assigneeName?: string;
  priority?: CommitmentPriority;
  dueAt?: string;
  completionNote?: string;
  proof?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
};

/**
 * Move a commitment along its lifecycle. Completing a proof-required commitment
 * without a proof/note is refused — the office never fakes closure.
 */
export async function advanceCommitment(
  input: AdvanceInput,
  options: { tenantId?: string; actor?: string } = {}
): Promise<{ ok: boolean; commitment: DecisionCommitment | null; reason?: string }> {
  const tenantId = options.tenantId || DEFAULT_TENANT;
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, commitment: null, reason: "متابعة القرارات تتطلب اتصال Supabase." };

  const { data: existing, error: findError } = await supabase
    .from("decision_commitments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", input.id)
    .maybeSingle();
  if (findError) return { ok: false, commitment: null, reason: findError.message };
  if (!existing) return { ok: false, commitment: null, reason: "الالتزام غير موجود." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.assigneeId || input.assigneeName) {
    const agent = input.assigneeId ? getAgent(input.assigneeId) : undefined;
    patch.assignee_id = input.assigneeId || existing.assignee_id;
    patch.assignee_name = input.assigneeName || agent?.name || existing.assignee_name;
    if (existing.status === "OPEN") patch.status = "ASSIGNED";
  }
  if (input.priority) patch.priority = input.priority;
  if (input.dueAt) patch.due_at = new Date(input.dueAt).toISOString();
  if (input.linkedEntityType) patch.linked_entity_type = input.linkedEntityType;
  if (input.linkedEntityId) patch.linked_entity_id = input.linkedEntityId;

  if (input.status) {
    if (input.status === "COMPLETED") {
      const note = input.completionNote?.trim() || input.proof?.trim() || "";
      if (existing.requires_proof && !note) {
        return { ok: false, commitment: null, reason: "هذا القرار ذو أثر حقيقي: الإغلاق يتطلب دليلاً أو ملاحظة إتمام." };
      }
      patch.status = "COMPLETED";
      patch.completed_at = new Date().toISOString();
      patch.completed_by = options.actor || existing.assignee_name || "owner";
      patch.completion_note = note || null;
    } else {
      patch.status = input.status;
    }
  }

  const { data, error } = await supabase
    .from("decision_commitments")
    .update(patch)
    .eq("id", input.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) return { ok: false, commitment: null, reason: error.message };

  const commitment = mapRow(data);
  recordAudit({
    actor: options.actor || "diwan",
    action: input.status === "COMPLETED" ? "DECISION_COMMITMENT_COMPLETED" : "DECISION_COMMITMENT_UPDATED",
    entityType: "decision_commitment",
    entityId: commitment.id,
    detail: `تحديث التزام «${commitment.title}» → ${commitment.status}${commitment.assigneeName ? ` (المسؤول: ${commitment.assigneeName})` : ""}.`,
  });
  return { ok: true, commitment };
}

/**
 * The daily chase. Due-or-overdue open commitments get a reminder stamp; a
 * commitment overdue past a grace window is escalated (flag raised so it
 * surfaces to the owner). Returns what happened for the cron summary.
 */
export async function sweepDecisionCommitments(
  tenantId = DEFAULT_TENANT
): Promise<{ reminded: number; escalated: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { reminded: 0, escalated: 0 };
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data, error } = await supabase
    .from("decision_commitments")
    .select("*")
    .eq("tenant_id", tenantId)
    .not("status", "in", "(COMPLETED,CANCELLED)")
    .lte("due_at", nowIso)
    .limit(200);
  if (error || !data) return { reminded: 0, escalated: 0 };

  let reminded = 0;
  let escalated = 0;
  for (const row of data) {
    const overdueDays = row.due_at ? (now - new Date(String(row.due_at)).getTime()) / 86_400_000 : 0;
    const patch: Record<string, unknown> = {
      reminded_at: nowIso,
      reminder_count: Number(row.reminder_count || 0) + 1,
      updated_at: nowIso,
    };
    // Escalate once, when it has slipped more than a day past due.
    if (overdueDays >= 1 && !row.escalated) {
      patch.escalated = true;
      patch.escalated_at = nowIso;
      escalated += 1;
    }
    const { error: updateError } = await supabase.from("decision_commitments").update(patch).eq("id", row.id);
    if (!updateError) reminded += 1;
  }
  if (escalated > 0) {
    recordAudit({
      actor: "diwan",
      action: "DECISION_COMMITMENTS_ESCALATED",
      entityType: "decision_commitment",
      entityId: tenantId,
      detail: `صعّد الديوان ${escalated} قراراً متأخراً إلى المالك، وذكّر ${reminded} التزاماً مستحقاً.`,
    });
  }
  return { reminded, escalated };
}

export type SecretariatBrief = {
  open: number;
  assigned: number;
  inProgress: number;
  overdue: number;
  needsOwner: number;
  escalated: number;
  completedThisPeriod: number;
  byAssignee: Array<{ assignee: string; open: number; overdue: number }>;
};

/** The owner-facing weekly picture: what's issued, owned, overdue, done. */
export async function secretariatBrief(tenantId = DEFAULT_TENANT): Promise<SecretariatBrief> {
  const supabase = getSupabaseAdmin();
  const empty: SecretariatBrief = { open: 0, assigned: 0, inProgress: 0, overdue: 0, needsOwner: 0, escalated: 0, completedThisPeriod: 0, byAssignee: [] };
  if (!supabase) return empty;

  const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [openRes, doneRes] = await Promise.all([
    supabase.from("decision_commitments").select("*").eq("tenant_id", tenantId).not("status", "in", "(COMPLETED,CANCELLED)").limit(500),
    supabase.from("decision_commitments").select("id").eq("tenant_id", tenantId).eq("status", "COMPLETED").gte("completed_at", sinceIso).limit(500),
  ]);
  const rows = (openRes.data || []).map(mapRow);
  const byAssigneeMap = new Map<string, { open: number; overdue: number }>();
  for (const r of rows) {
    const key = r.assigneeName || "بلا مسؤول";
    const entry = byAssigneeMap.get(key) || { open: 0, overdue: 0 };
    entry.open += 1;
    if (r.overdue) entry.overdue += 1;
    byAssigneeMap.set(key, entry);
  }
  return {
    open: rows.filter((r) => r.status === "OPEN").length,
    assigned: rows.filter((r) => r.status === "ASSIGNED").length,
    inProgress: rows.filter((r) => r.status === "IN_PROGRESS").length,
    overdue: rows.filter((r) => r.overdue).length,
    needsOwner: rows.filter((r) => r.needsOwner).length,
    escalated: rows.filter((r) => r.escalated).length,
    completedThisPeriod: (doneRes.data || []).length,
    byAssignee: [...byAssigneeMap.entries()].map(([assignee, v]) => ({ assignee, ...v })).sort((a, b) => b.overdue - a.overdue || b.open - a.open),
  };
}
