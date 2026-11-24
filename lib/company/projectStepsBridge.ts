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

/**
 * The Chairman's own REJECTION, relayed by his assistant from his words in
 * chat, recorded on any spend request. Rejection only: this path can
 * never approve money, so a leaked bridge key cannot release spend. The
 * decision is stamped with who relayed it and the Chairman's quoted words.
 */
export async function recordRelayedOwnerRejection(input: { approvalId: string; ownerWords: string; relayedBy: string; note?: string }) {
  const { decideApprovalCritical, getApprovalCritical, writeApprovalCritical } = await import("../approvals");
  const { applyTaskFundingDecision } = await import("../companyExecutionSystem");
  const { settleChairmanCommandForSpend } = await import("./chairmanCommands");
  const { appendWorkEvent } = await import("./workEvents");
  const { readSpendChain } = await import("./spendChain");
  const item = await getApprovalCritical(input.approvalId);
  if (!item) throw new Error("طلب الصرف غير موجود.");
  const { isMonetarySpend } = await import("./spendChain");
  // Any spend request (project step, opportunity radar, idea): rejection never releases money.
  if (item.metadata?.source !== "project-spend-step" && !isMonetarySpend(item.amount)) throw new Error("هذا المسار لطلبات الصرف فقط.");
  if (item.status === "REJECTED") return { approvalId: item.id, status: item.status, idempotent: true };
  if (item.status !== "PENDING" && item.status !== "DEFERRED") throw new Error(`صدر قرار مختلف بالفعل (${item.status}).`);
  const note = `قرار رئيس مجلس الإدارة: الرفض. نصّه: «${input.ownerWords.slice(0, 600)}»${input.note ? ` — ${input.note.slice(0, 600)}` : ""} (نقله ${input.relayedBy} من محادثة الرئيس)`;
  const decided = await decideApprovalCritical(item.id, "REJECTED", "رئيس مجلس الإدارة", note);
  if (!decided) throw new Error("تعذر تسجيل القرار.");
  const chain = readSpendChain(decided);
  const saved = await writeApprovalCritical({
    ...decided,
    metadata: {
      ...decided.metadata,
      ...(chain ? { spendChain: { ...chain, stage: "decided", decision: "REJECTED", decidedAt: new Date().toISOString(), note } } : {}),
      ownerDecision: { decision: "REJECTED", words: input.ownerWords.slice(0, 600), relayedBy: input.relayedBy, at: new Date().toISOString(), channel: "chat-relay" },
    },
  });
  let execution: unknown = null;
  if (saved.metadata?.source === "governanceOS") {
    // The governed entity (e.g. an opportunity-radar run and its campaign) follows the decision.
    const { executeGovernedApprovalDecision } = await import("./governedApprovalExecution");
    execution = await executeGovernedApprovalDecision(saved.metadata || {}, "REJECTED", "رئيس مجلس الإدارة").catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : "transition failed" }));
  } else {
    execution = await applyTaskFundingDecision(saved.metadata || {}, "REJECTED");
  }
  await settleChairmanCommandForSpend(saved.id, "REJECTED").catch(() => undefined);
  await appendWorkEvent({ entityType: "spend", entityId: saved.id, actor: "owner", action: "owner_decision", fromState: "owner", toState: "decided", note, evidence: null }).catch(() => undefined);
  return { approvalId: saved.id, status: saved.status, decidedBy: saved.decidedBy, task: execution };
}
