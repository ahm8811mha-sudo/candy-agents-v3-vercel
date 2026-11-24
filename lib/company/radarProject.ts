/**
 * Links every opportunity-radar spend request to its own project, so no
 * decision in the Chairman's file reads «غير مرتبط بمشروع». The project is a
 * proposal record (no steps): its status mirrors the decision on the request.
 * Touches only projects whose id is derived from a radar run.
 */
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
import { isArchived, isMonetarySpend, linkedProjectId, readSpendChain } from "./spendChain";
import { isRadarApproval, radarProjectId, radarProjectStatus, radarRunId } from "./radarGuard";

type Approval = {
  id: string; title: string; amount?: number; status: string; metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function ensureRadarProject(input: {
  runId: string; title: string; amountSAR: number; request?: string; approvalStatus?: string; riskLevel?: string;
}, tenantId = getTenantId()): Promise<{ projectId: string; created: boolean } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const id = radarProjectId(input.runId);
  const { data: existing, error: readError } = await supabase.from("projects").select("id").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (existing) {
    // Keep the name in the Chairman's language (older runs carried an English title).
    await supabase.from("projects").update({ name: `رادار الفرص: ${input.title}`.slice(0, 300) }).eq("tenant_id", tenantId).eq("id", id);
    return { projectId: id, created: false };
  }
  const status = radarProjectStatus(input.approvalStatus);
  const { error } = await supabase.from("projects").insert({
    id,
    tenant_id: tenantId,
    name: `رادار الفرص: ${input.title}`.slice(0, 300),
    request: (input.request || `طلب صرف من رادار الفرص (${input.amountSAR} ر.س). المشروع يتبع قرار رئيس مجلس الإدارة على الطلب.`).slice(0, 2000),
    status: status.status,
    approval_status: status.approval_status,
    budget: input.amountSAR,
    approved_budget: 0,
    risk_level: input.riskLevel || "MEDIUM",
    strategic_direction: `radar-run:${input.runId}`,
  });
  if (error) throw error;
  return { projectId: id, created: true };
}

/** The radar project follows the decision on its request. Only radar-derived ids are touched. */
export async function syncRadarProjectStatus(runId: string, approvalStatus: string, tenantId = getTenantId()) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const status = radarProjectStatus(approvalStatus);
  const update: Record<string, unknown> = { ...status };
  if (approvalStatus === "REJECTED") update.approved_budget = 0;
  await supabase.from("projects").update(update).eq("tenant_id", tenantId).eq("id", radarProjectId(runId));
}

async function linkApproval(item: Approval, projectId: string) {
  const { writeApprovalCritical } = await import("../approvals");
  return writeApprovalCritical({ ...(item as unknown as import("../approvals").ApprovalItem), metadata: { ...(item.metadata || {}), projectId } });
}

/** The Arabic subject of a radar request (the chain subject), else its title without the radar prefix. */
export function radarProjectTitle(item: { title: string; amount?: number | null; metadata?: Record<string, unknown> | null }): string {
  const chain = readSpendChain(item as never);
  const subject = String(chain?.subject || item.title || "").replace(/^.*?رادار الفرص\s*[:：]\s*/u, "").trim();
  return subject || "طلب صرف من رادار الفرص";
}

/** Remove a radar project created for a merged duplicate: only a radar-derived id with no steps. */
async function dropEmptyRadarProject(item: Approval, projectId: string, tenantId = getTenantId()) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const runId = radarRunId(item as never);
  if (!runId || radarProjectId(runId) !== projectId) return false;
  const { count, error } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("project_id", projectId);
  if (error || (count || 0) > 0) return false;
  const meta = { ...(item.metadata || {}) };
  delete meta.projectId;
  const { writeApprovalCritical } = await import("../approvals");
  await writeApprovalCritical({ ...(item as unknown as import("../approvals").ApprovalItem), metadata: meta });
  const { error: deleteError } = await supabase.from("projects").delete().eq("tenant_id", tenantId).eq("id", projectId);
  return !deleteError;
}

/**
 * Backfill: every live radar spend request (not a merged duplicate) without a
 * project gets one and is linked both ways. A merged duplicate never gets a
 * project; one created for it by mistake (empty, radar-derived id) is removed.
 */
export async function linkRadarRequestsToProjects(approvals: Approval[]) {
  const linked: Array<{ approvalId: string; projectId: string; created: boolean; status: string }> = [];
  const removed: Array<{ approvalId: string; projectId: string }> = [];
  for (const item of approvals) {
    if (!isMonetarySpend(item.amount) || !isRadarApproval(item as never)) continue;
    const runId = radarRunId(item as never);
    if (!runId) continue;
    const current = linkedProjectId(item as never);
    if (isArchived(item as never)) {
      if (current && current === radarProjectId(runId) && await dropEmptyRadarProject(item, current)) removed.push({ approvalId: item.id, projectId: current });
      continue;
    }
    // A request already linked to another project keeps that link.
    if (current && current !== radarProjectId(runId)) continue;
    const ensured = await ensureRadarProject({
      runId,
      title: radarProjectTitle(item),
      amountSAR: Number(item.amount),
      approvalStatus: item.status,
      riskLevel: typeof item.metadata?.riskLevel === "string" ? item.metadata.riskLevel : undefined,
    });
    if (!ensured) continue;
    await syncRadarProjectStatus(runId, item.status);
    if (current !== ensured.projectId) await linkApproval(item, ensured.projectId);
    linked.push({ approvalId: item.id, projectId: ensured.projectId, created: ensured.created, status: item.status });
  }
  return { linked, removed };
}
