/**
 * Links every opportunity-radar spend request to its own project, so no
 * decision in the Chairman's file reads «غير مرتبط بمشروع». The project is a
 * proposal record (no steps): its status mirrors the decision on the request.
 * Touches only projects whose id is derived from a radar run.
 */
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
import { isMonetarySpend, linkedProjectId } from "./spendChain";
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
  if (existing) return { projectId: id, created: false };
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

/**
 * Backfill: every radar spend request without a project gets one and is linked
 * (both ways: the request names the project; the project carries the run id).
 */
export async function linkRadarRequestsToProjects(approvals: Approval[]) {
  const linked: Array<{ approvalId: string; projectId: string; created: boolean; status: string }> = [];
  for (const item of approvals) {
    if (!isMonetarySpend(item.amount) || !isRadarApproval(item as never)) continue;
    const runId = radarRunId(item as never);
    if (!runId) continue;
    const current = linkedProjectId(item as never);
    // A request already linked to another project keeps that link.
    if (current && current !== radarProjectId(runId)) continue;
    const opportunity = (item.metadata?.opportunity || {}) as Record<string, unknown>;
    const ensured = await ensureRadarProject({
      runId,
      title: String(opportunity.title || item.title).replace(/^.*?رادار الفرص\s*[:：]\s*/u, ""),
      amountSAR: Number(item.amount),
      approvalStatus: item.status,
      riskLevel: typeof item.metadata?.riskLevel === "string" ? item.metadata.riskLevel : undefined,
    });
    if (!ensured) continue;
    await syncRadarProjectStatus(runId, item.status);
    if (current !== ensured.projectId) await linkApproval(item, ensured.projectId);
    linked.push({ approvalId: item.id, projectId: ensured.projectId, created: ensured.created, status: item.status });
  }
  return linked;
}
