import { postBridgeMessage } from "./agentBridge";
import { createApprovalCritical, hydrateApprovals, listApprovals } from "../approvals";
import { blankSpendChain } from "./spendChain";
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
import { sweepProjectSteps } from "./projectSteps";

/** Sweep notifications land in the employee's bridge inbox, never outside the company. */
export async function notifyAgent(agentId: string, body: string) {
  await postBridgeMessage(agentId, { direction: "inbound", body, author: "project-sweep" });
}

export async function runProjectSweep(options: { projectId?: string; reactivate?: boolean; actor?: string } = {}) {
  return sweepProjectSteps({ ...options, notify: notifyAgent });
}

/**
 * Adds the one money step a project needs and opens its spend request at the
 * department stage. Approval releases the step (TASK_FUNDING), rejection holds it.
 * No employee can approve it; the chain ends with the Chairman.
 */
export async function openProjectSpendStep(input: {
  projectId: string;
  title: string;
  detail: string;
  amountSAR: number;
  preparingAgentId: string;
  dueDate?: string;
}) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("يتطلب قاعدة البيانات.");
  const tenantId = getTenantId();
  if (!(input.amountSAR > 0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  const { data: project, error } = await client.from("projects").select("id,project_number,name").eq("id", input.projectId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  if (!project) throw new Error("المشروع غير موجود.");
  await hydrateApprovals();
  const existing = listApprovals().find((item) => item.metadata?.kind === "TASK_FUNDING" && item.metadata?.projectId === input.projectId && (item.status === "PENDING" || item.status === "DEFERRED"));
  if (existing) return { approvalId: existing.id, taskId: String(existing.metadata?.taskId || ""), existing: true };
  const taskId = `task-spend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const { error: insertError } = await client.from("tasks").insert({
    id: taskId,
    tenant_id: tenantId,
    project_id: input.projectId,
    title: input.title.slice(0, 200),
    description: input.detail.slice(0, 4000),
    content: input.detail.slice(0, 4000),
    status: "WAITING_FUNDING",
    priority: "HIGH",
    owner_role: "Operations Manager",
    due_date: input.dueDate || null,
    progress_percent: 0,
    created_at: now,
    updated_at: now,
    metadata: { executionKind: "REAL_WORLD", requiresFunding: true, estimatedCostSAR: input.amountSAR, assignedAgent: input.preparingAgentId, source: "project-spend-step" },
  });
  if (insertError) throw insertError;
  const approval = await createApprovalCritical({
    type: "BUDGET",
    title: input.title.slice(0, 140),
    detail: input.detail.slice(0, 4000),
    amount: input.amountSAR,
    requestedRole: "رئيس مجلس الإدارة",
    metadata: {
      kind: "TASK_FUNDING",
      taskId,
      projectId: input.projectId,
      projectNumber: project.project_number ?? null,
      preparingAgentId: input.preparingAgentId,
      source: "project-spend-step",
      spendChain: blankSpendChain({ amountSAR: input.amountSAR, subject: input.title.slice(0, 140), preparingAgentId: input.preparingAgentId }),
    },
  });
  await client.from("tasks").update({ metadata: { executionKind: "REAL_WORLD", requiresFunding: true, estimatedCostSAR: input.amountSAR, assignedAgent: input.preparingAgentId, source: "project-spend-step", approvalId: approval.id } }).eq("id", taskId).eq("tenant_id", tenantId);
  return { approvalId: approval.id, taskId, existing: false };
}
