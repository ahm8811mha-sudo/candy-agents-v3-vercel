import { getSupabaseAdmin } from "../supabase";
import { getTenantId, isMultiTenantEnabled } from "../tenant";

export type GovernedActionKind =
  | "ACCOUNTING_PERIOD_CLOSE"
  | "MARKETING_CAMPAIGN"
  | "OPPORTUNITY_RADAR_PILOT"
  | "GOVERNMENT_RENEWAL"
  | "COMPANY_EXECUTION_PROJECT";

type Decision = "APPROVED" | "REJECTED";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function scoped(query: any) {
  return isMultiTenantEnabled() ? query.eq("tenant_id", getTenantId()) : query;
}

async function ensureUpdate(result: { error: { message?: string } | null }, label: string) {
  if (result.error) throw new Error(`${label}: ${result.error.message || "database update failed"}`);
}

/**
 * Executes only explicitly allow-listed state transitions. Approval metadata
 * cannot choose an arbitrary table or arbitrary update payload.
 */
export async function executeGovernedApprovalDecision(
  metadata: Record<string, unknown>,
  decision: Decision,
  decidedBy: string
) {
  const actionKind = text(metadata.actionKind) as GovernedActionKind;
  const entityId = text(metadata.entityId);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { simulated: true, actionKind, entityId, decision };
  }
  if (!entityId) throw new Error("Governed approval is missing its entityId.");

  if (actionKind === "ACCOUNTING_PERIOD_CLOSE") {
    const result = await scoped(
      supabase
        .from("accounting_period_closes")
        .update({ status: decision === "APPROVED" ? "CLOSED" : "REJECTED", closed_by_role: decidedBy })
        .eq("id", entityId)
    );
    await ensureUpdate(result, "Accounting period transition failed");
    return { actionKind, entityId, decision, status: decision === "APPROVED" ? "CLOSED" : "REJECTED" };
  }

  if (actionKind === "MARKETING_CAMPAIGN") {
    const status = decision === "APPROVED" ? "TESTING" : "REJECTED";
    const campaign = await scoped(supabase.from("marketing_campaigns").update({ status }).eq("id", entityId));
    await ensureUpdate(campaign, "Marketing campaign transition failed");
    const action = await scoped(
      supabase
        .from("business_actions")
        .update({
          status: decision === "APPROVED" ? "QUEUED" : "CANCELLED",
          approval_status: decision,
        })
        .contains("payload", { campaign_id: entityId })
    );
    await ensureUpdate(action, "Marketing action transition failed");
    return { actionKind, entityId, decision, status };
  }

  if (actionKind === "OPPORTUNITY_RADAR_PILOT") {
    const campaignId = text(metadata.campaignId);
    const radar = await scoped(
      supabase
        .from("opportunity_radar_runs")
        .update({ status: decision === "APPROVED" ? "APPROVED_FOR_PILOT" : "REJECTED" })
        .eq("id", entityId)
    );
    await ensureUpdate(radar, "Opportunity radar transition failed");
    if (campaignId) {
      const campaign = await scoped(
        supabase
          .from("marketing_campaigns")
          .update({ status: decision === "APPROVED" ? "RADAR_DRAFT" : "REJECTED" })
          .eq("id", campaignId)
      );
      await ensureUpdate(campaign, "Radar campaign transition failed");
    }
    const action = await scoped(
      supabase
        .from("business_actions")
        .update({
          status: decision === "APPROVED" ? "QUEUED" : "CANCELLED",
          approval_status: decision,
        })
        .contains("payload", { radar_run_id: entityId })
    );
    await ensureUpdate(action, "Radar action transition failed");
    return { actionKind, entityId, campaignId: campaignId || null, decision };
  }

  if (actionKind === "GOVERNMENT_RENEWAL") {
    const taskId = text(metadata.renewalTaskId || metadata.renewal_task_id || metadata.task_id);
    if (taskId) {
      const task = await scoped(
        supabase
          .from("gov_renewal_tasks")
          .update({ status: decision === "APPROVED" ? "READY_FOR_SUBMISSION" : "REJECTED" })
          .eq("id", taskId)
      );
      await ensureUpdate(task, "Government renewal task transition failed");
    }
    const action = await scoped(
      supabase
        .from("business_actions")
        .update({
          status: decision === "APPROVED" ? "READY" : "CANCELLED",
          approval_status: decision,
        })
        .contains("payload", { governed_entity_id: entityId })
    );
    await ensureUpdate(action, "Government renewal action transition failed");
    return { actionKind, entityId, taskId: taskId || null, decision };
  }

  if (actionKind === "COMPANY_EXECUTION_PROJECT") {
    const project = await scoped(
      supabase
        .from("projects")
        .update({
          status: decision === "APPROVED" ? "ACTIVE" : "REJECTED",
          approval_status: decision,
          ...(decision === "APPROVED" ? { approved_budget: Number(metadata.requestedBudget) || 0 } : {}),
        })
        .eq("id", entityId)
    );
    await ensureUpdate(project, "Execution project transition failed");
    const tasks = await scoped(
      supabase
        .from("tasks")
        .update({ status: decision === "APPROVED" ? "TODO" : "BLOCKED" })
        .eq("project_id", entityId)
    );
    await ensureUpdate(tasks, "Execution tasks transition failed");
    const actions = await scoped(
      supabase
        .from("business_actions")
        .update({
          status: decision === "APPROVED" ? "QUEUED" : "CANCELLED",
          approval_status: decision,
        })
        .eq("project_id", entityId)
        .eq("requires_approval", true)
    );
    await ensureUpdate(actions, "Execution actions transition failed");
    return { actionKind, entityId, decision };
  }

  throw new Error(`Unsupported governed action kind: ${actionKind || "missing"}`);
}
