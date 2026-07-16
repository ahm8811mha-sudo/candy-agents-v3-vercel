import { createHash, randomUUID } from "node:crypto";
import { createAccountingInvoiceAtomic } from "../accountingRepository";
import { effectiveTier } from "../company/governance";
import { authorizeActionDuringOwnerAbsence } from "../company/ownerAbsence";
import { getSupabaseAdmin } from "../supabase";
import { normalizeTenantId } from "../tenant";
import { employeeHasCapability, requireEmployeeProfile, resolveActiveEmployee } from "./registry";
import type {
  EmployeeRiskLevel,
  ExecutionEvidence,
  ExecutionMode,
  RuntimePolicyDecision,
  ToolExecutionResult,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderStep,
} from "./types";

const memory = new Map<string, WorkOrder>();
const memoryKeys = new Map<string, string>();
const RISK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;
const now = () => new Date().toISOString();
const round2 = (value: number) => Math.round(value * 100) / 100;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createProjectNumber(seed: string, date = new Date()) {
  return `PRJ-${date.getUTCFullYear()}-${hash(seed).slice(0, 6).toUpperCase()}`;
}

export function createWorkOrderNumber(projectNumber: string, sequence = 1) {
  return `${projectNumber}/${String(sequence).padStart(3, "0")}`;
}

export function resolveEmployeeRuntimeMode(): ExecutionMode {
  const mode = String(process.env.EMPLOYEE_RUNTIME_MODE || "").toLowerCase();
  if (mode === "simulation") return "SIMULATION";
  return getSupabaseAdmin() ? "LIVE" : "SIMULATION";
}

function rowToWorkOrder(row: Record<string, unknown>): WorkOrder {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), projectNumber: String(row.project_number),
    workOrderNumber: String(row.work_order_number), kind: String(row.kind) as WorkOrder["kind"],
    title: String(row.title), objective: String(row.objective), requestedBy: String(row.requested_by),
    ownerEmployeeId: String(row.owner_employee_id), backupEmployeeId: row.backup_employee_id ? String(row.backup_employee_id) : null,
    department: String(row.department), amountSAR: Number(row.amount_sar || 0),
    riskLevel: String(row.risk_level || "LOW") as WorkOrder["riskLevel"], status: String(row.status) as WorkOrderStatus,
    executionMode: String(row.execution_mode || "SIMULATION") as ExecutionMode, requiresApproval: row.requires_approval === true,
    approvalTier: String(row.approval_tier || "T0") as WorkOrder["approvalTier"],
    approvalStatus: String(row.approval_status || "NOT_REQUIRED") as WorkOrder["approvalStatus"],
    idempotencyKey: String(row.idempotency_key), acceptanceCriteria: Array.isArray(row.acceptance_criteria) ? row.acceptance_criteria.map(String) : [],
    steps: Array.isArray(row.steps) ? row.steps as WorkOrderStep[] : [],
    context: row.context && typeof row.context === "object" ? row.context as Record<string, unknown> : {},
    result: row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : null,
    error: row.error ? String(row.error) : null, createdAt: String(row.created_at || now()), updatedAt: String(row.updated_at || now()),
    startedAt: row.started_at ? String(row.started_at) : null, completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function row(workOrder: WorkOrder) {
  return {
    id: workOrder.id, tenant_id: workOrder.tenantId, project_number: workOrder.projectNumber,
    work_order_number: workOrder.workOrderNumber, kind: workOrder.kind, title: workOrder.title,
    objective: workOrder.objective, requested_by: workOrder.requestedBy, owner_employee_id: workOrder.ownerEmployeeId,
    backup_employee_id: workOrder.backupEmployeeId || null, department: workOrder.department, amount_sar: workOrder.amountSAR,
    risk_level: workOrder.riskLevel, status: workOrder.status, execution_mode: workOrder.executionMode,
    requires_approval: workOrder.requiresApproval, approval_tier: workOrder.approvalTier, approval_status: workOrder.approvalStatus,
    idempotency_key: workOrder.idempotencyKey, acceptance_criteria: workOrder.acceptanceCriteria, steps: workOrder.steps,
    context: workOrder.context, result: workOrder.result || null, error: workOrder.error || null,
    created_at: workOrder.createdAt, updated_at: workOrder.updatedAt, started_at: workOrder.startedAt || null,
    completed_at: workOrder.completedAt || null,
  };
}

export async function saveWorkOrder(workOrder: WorkOrder): Promise<WorkOrder> {
  const updated = { ...workOrder, updatedAt: now() };
  const supabase = getSupabaseAdmin();
  if (!supabase) { memory.set(updated.id, updated); return updated; }
  const { data, error } = await supabase.from("employee_work_orders").upsert(row(updated), { onConflict: "id" }).select("*").single();
  if (error) throw new Error(`Unable to save work order: ${error.message}`);
  return rowToWorkOrder(data as Record<string, unknown>);
}

export async function getWorkOrder(id: string, tenantId?: string): Promise<WorkOrder | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return memory.get(id) || null;
  let query = supabase.from("employee_work_orders").select("*").eq("id", id);
  if (tenantId) query = query.eq("tenant_id", normalizeTenantId(tenantId));
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to load work order: ${error.message}`);
  return data ? rowToWorkOrder(data as Record<string, unknown>) : null;
}

export async function listWorkOrders(tenantId: string, limit = 50): Promise<WorkOrder[]> {
  const tenant = normalizeTenantId(tenantId); const supabase = getSupabaseAdmin();
  if (!supabase) return [...memory.values()].filter((item) => item.tenantId === tenant).slice(0, limit);
  const { data, error } = await supabase.from("employee_work_orders").select("*").eq("tenant_id", tenant)
    .order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(`Unable to list work orders: ${error.message}`);
  return (data || []).map((item: unknown) => rowToWorkOrder(item as Record<string, unknown>));
}

async function event(workOrder: WorkOrder, eventType: string, actor: string, step?: WorkOrderStep, detail: Record<string, unknown> = {}) {
  const supabase = getSupabaseAdmin(); if (!supabase) return;
  await supabase.from("employee_work_order_events").insert({ tenant_id: workOrder.tenantId, work_order_id: workOrder.id,
    event_type: eventType, actor, employee_id: step?.employeeId || null, step_id: step?.id || null, detail });
}

async function receipt(workOrder: WorkOrder, step: WorkOrderStep, result: ToolExecutionResult, verified: boolean, verification: Record<string, unknown>) {
  const inputHash = hash(step.input);
  const evidence: ExecutionEvidence = {
    receiptId: hash(`${workOrder.id}:${step.id}:${step.attempts}:${inputHash}`).slice(0, 40), workOrderId: workOrder.id,
    workOrderNumber: workOrder.workOrderNumber, stepId: step.id, employeeId: step.employeeId, tool: step.tool,
    mode: workOrder.executionMode, inputHash, providerReference: result.providerReference || null, verified,
    reconciliationStatus: result.reconciliationStatus || "NOT_REQUIRED",
    details: { tenantId: workOrder.tenantId, output: result.output, verification }, createdAt: now(),
  };
  const supabase = getSupabaseAdmin();
  if (supabase) await supabase.from("employee_execution_receipts").upsert({
    id: evidence.receiptId, tenant_id: workOrder.tenantId, work_order_id: workOrder.id,
    work_order_number: workOrder.workOrderNumber, step_id: step.id, employee_id: step.employeeId,
    tool: step.tool, mode: workOrder.executionMode, input_hash: inputHash, provider_reference: evidence.providerReference,
    verified, reconciliation_status: evidence.reconciliationStatus, details: evidence.details, created_at: evidence.createdAt,
  }, { onConflict: "id" });
  return evidence;
}

export async function evaluateRuntimePolicy(workOrder: WorkOrder, step: WorkOrderStep): Promise<RuntimePolicyDecision> {
  const employee = requireEmployeeProfile(step.employeeId); const reasons: string[] = []; const controls = ["idempotency", "verification", "receipt", "audit"];
  if (!employeeHasCapability(step.employeeId, step.capability)) return { allowed: false, autonomous: false, approvalTier: "T2", approvalRequired: true, approverEmployeeId: "owner", reasons: [`${employee.name} لا يملك ${step.capability}.`], controls };
  const commitmentSAR = Math.max(0, Number(step.input.commitmentSAR || 0));
  const tier = effectiveTier(commitmentSAR || 0.01, workOrder.riskLevel);
  const riskOk = RISK[workOrder.riskLevel] <= RISK[employee.maxAutonomousRisk];
  const amountOk = commitmentSAR === 0 || commitmentSAR <= employee.authorityLimitSAR;
  let autonomous = tier.tier === "T0" && riskOk && amountOk;
  if (!riskOk) reasons.push("مستوى المخاطر أعلى من حد الموظف.");
  if (!amountOk) reasons.push("الالتزام المالي أعلى من حد الموظف.");
  if (tier.tier !== "T0") reasons.push(`مطلوب اعتماد ${tier.tier}.`);
  const absence = await authorizeActionDuringOwnerAbsence({ id: workOrder.id, project_id: workOrder.projectNumber,
    action_type: step.capability, execution_mode: workOrder.executionMode, provider: step.tool,
    requires_approval: !autonomous, approval_status: workOrder.approvalStatus,
    payload: { amountSAR: commitmentSAR, riskLevel: workOrder.riskLevel, external: workOrder.executionMode === "LIVE" } }, workOrder.tenantId);
  if (!absence.decision.allowed) { autonomous = false; reasons.push(...absence.decision.reasons); }
  const approvalRequired = !autonomous;
  const approverEmployeeId = tier.tier === "T0" ? step.employeeId : tier.tier === "T1" ? "sultan" : "owner";
  const allowed = absence.decision.allowed && (!approvalRequired || workOrder.approvalStatus === "APPROVED");
  if (!allowed && approvalRequired) reasons.push(`بانتظار اعتماد ${approverEmployeeId}.`);
  return { allowed, autonomous, approvalTier: tier.tier, approvalRequired, approverEmployeeId,
    reasons: reasons.length ? [...new Set(reasons)] : ["ضمن الصلاحية."], controls: [...new Set([...controls, ...absence.decision.controls])] };
}

function requiredString(value: unknown, name: string) { const text = typeof value === "string" ? value.trim() : ""; if (!text) throw new Error(`${name} is required.`); return text; }
function requiredNumber(value: unknown, name: string, zero = false) { const n = Number(value); if (!Number.isFinite(n) || (zero ? n < 0 : n <= 0)) throw new Error(`${name} is invalid.`); return round2(n); }
function simulated(workOrder: WorkOrder, step: WorkOrderStep, operation: string, output: Record<string, unknown>): ToolExecutionResult {
  return { output: { simulated: true, operation, ...output }, providerReference: `sim:${workOrder.id}:${step.id}`, reconciliationStatus: "NOT_REQUIRED" };
}

async function executeTool(workOrder: WorkOrder, step: WorkOrderStep): Promise<ToolExecutionResult> {
  const input = step.input; const supabase = getSupabaseAdmin();
  if (step.tool === "verify_payment") {
    if (input.paymentConfirmed !== true) throw new Error("Payment is not confirmed.");
    return { output: { paymentConfirmed: true, orderId: input.orderId, amountSAR: input.amountSAR }, providerReference: String(input.paymentReference || input.orderId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "calculate_margin") {
    const amount = requiredNumber(input.amountSAR, "amountSAR"); const cost = requiredNumber(input.unitCostSAR || 0, "unitCostSAR", true) * requiredNumber(input.quantity, "quantity");
    const profit = round2(amount - cost); const margin = round2(profit / amount * 100); const minimum = Number(input.minimumMarginPercent || 20);
    return { output: { amountSAR: amount, costSAR: round2(cost), grossProfitSAR: profit, marginPercent: margin, marginAlert: margin < minimum }, providerReference: String(input.orderId) };
  }
  if (workOrder.executionMode === "SIMULATION") return simulated(workOrder, step, step.tool, { orderId: input.orderId });
  if (!supabase) throw new Error("Supabase is required for live execution.");
  if (step.tool === "record_sale") {
    const { data, error } = await supabase.from("employee_sales_orders").upsert({ tenant_id: workOrder.tenantId,
      order_id: requiredString(input.orderId, "orderId"), work_order_id: workOrder.id,
      customer_name: requiredString(input.customerName, "customerName"), customer_email: input.customerEmail || null,
      product_name: requiredString(input.productName, "productName"), sku: requiredString(input.sku, "sku"),
      quantity: Number(input.quantity), amount_sar: Number(input.amountSAR), channel: String(input.channel || "direct"),
      payment_reference: String(input.paymentReference || input.orderId), status: "PAID", updated_at: now() },
      { onConflict: "tenant_id,order_id" }).select("*").single();
    if (error) throw new Error(error.message); return { output: { sale: data }, providerReference: String(input.orderId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "create_sales_invoice") {
    const total = requiredNumber(input.amountSAR, "amountSAR"); const tax = requiredNumber(input.taxSAR || 0, "taxSAR", true);
    const invoice = await createAccountingInvoiceAtomic({ invoiceType: "SALES", contactName: requiredString(input.customerName, "customerName"),
      subtotal: round2(total - tax), tax, notes: `Order ${String(input.orderId)} / ${workOrder.workOrderNumber}`,
      idempotencyKey: `employee-runtime:${workOrder.tenantId}:${String(input.orderId)}` });
    return { output: { invoice }, providerReference: String((invoice as Record<string, unknown>).invoiceId || input.orderId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "reserve_inventory") {
    const { data, error } = await supabase.rpc("orvanta_reserve_employee_inventory", { p_tenant_id: workOrder.tenantId,
      p_sku: requiredString(input.sku, "sku"), p_quantity: Number(input.quantity), p_work_order_id: workOrder.id, p_order_id: String(input.orderId) });
    if (error) throw new Error(error.message); return { output: { reservation: data }, providerReference: `${String(input.sku)}:${String(input.orderId)}`, reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "create_fulfillment_order") {
    const { data, error } = await supabase.from("employee_fulfillment_orders").upsert({ tenant_id: workOrder.tenantId,
      order_id: String(input.orderId), work_order_id: workOrder.id, customer_name: String(input.customerName),
      product_name: String(input.productName), sku: String(input.sku), quantity: Number(input.quantity), status: "READY_TO_PICK",
      due_at: new Date(Date.now() + 86_400_000).toISOString(), updated_at: now() }, { onConflict: "tenant_id,order_id" }).select("*").single();
    if (error) throw new Error(error.message); return { output: { fulfillment: data }, providerReference: String((data as Record<string, unknown>).id || input.orderId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "update_crm") {
    const customerKey = String(input.customerEmail || `${String(input.customerName)}:${String(input.orderId)}`);
    const { data, error } = await supabase.rpc("orvanta_upsert_employee_customer", { p_tenant_id: workOrder.tenantId,
      p_customer_key: customerKey, p_name: String(input.customerName), p_email: input.customerEmail || null,
      p_order_id: String(input.orderId), p_order_amount: Number(input.amountSAR), p_channel: String(input.channel || "direct") });
    if (error) throw new Error(error.message); return { output: { customer: data }, providerReference: customerKey, reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "update_kpi") {
    const key = `order-completed:${String(input.orderId)}`;
    const { data, error } = await supabase.from("employee_kpi_events").upsert({ tenant_id: workOrder.tenantId, event_key: key,
      work_order_id: workOrder.id, employee_id: "sara", kpi_id: "order_execution_success", value: 1, unit: "COUNT",
      metadata: { orderId: input.orderId, amountSAR: input.amountSAR, channel: input.channel } }, { onConflict: "tenant_id,event_key" }).select("*").single();
    if (error) throw new Error(error.message); return { output: { kpiEvent: data }, providerReference: key, reconciliationStatus: "MATCHED" };
  }
  throw new Error(`Tool not implemented: ${step.tool}`);
}

async function verifyTool(workOrder: WorkOrder, step: WorkOrderStep, result: ToolExecutionResult) {
  if (workOrder.executionMode === "SIMULATION") return { verified: true, detail: { simulated: true } };
  if (step.tool === "verify_payment") return { verified: result.output.paymentConfirmed === true, detail: result.output };
  if (step.tool === "calculate_margin") return { verified: Number.isFinite(Number(result.output.marginPercent)), detail: result.output };
  return { verified: Boolean(result.providerReference), detail: { providerReference: result.providerReference || null } };
}

export async function executeWorkOrder(initial: WorkOrder, actor = "employee-runtime", unavailable: string[] = []): Promise<WorkOrder> {
  if (["DONE", "CANCELLED", "ROLLED_BACK"].includes(initial.status)) return initial;
  let workOrder = await saveWorkOrder({ ...initial, status: "PLANNED", executionMode: resolveEmployeeRuntimeMode(), startedAt: initial.startedAt || now() });
  await event(workOrder, "WORK_ORDER_PLANNED", actor);
  for (const original of [...workOrder.steps].sort((a, b) => a.sequence - b.sequence)) {
    if (["DONE", "SKIPPED"].includes(original.status)) continue;
    const active = resolveActiveEmployee(original.employeeId, unavailable); const step = { ...original, employeeId: active.id };
    workOrder = await saveWorkOrder({ ...workOrder, status: "POLICY_CHECK" }); const policy = await evaluateRuntimePolicy(workOrder, step);
    await event(workOrder, policy.allowed ? "POLICY_ALLOWED" : "POLICY_BLOCKED", actor, step, policy as unknown as Record<string, unknown>);
    if (!policy.allowed) return saveWorkOrder({ ...workOrder, status: policy.approvalRequired ? "WAITING_APPROVAL" : "ESCALATED",
      requiresApproval: policy.approvalRequired, approvalTier: policy.approvalTier,
      approvalStatus: policy.approvalRequired ? "PENDING" : workOrder.approvalStatus, error: policy.reasons.join(" ") });
    const attempts = original.attempts + 1; const running = { ...step, attempts, status: "RUNNING" as const, startedAt: step.startedAt || now(), error: null };
    workOrder = await saveWorkOrder({ ...workOrder, status: "EXECUTING", steps: workOrder.steps.map((item) => item.id === step.id ? running : item), error: null });
    try {
      const result = await executeTool(workOrder, running); workOrder = await saveWorkOrder({ ...workOrder, status: "VERIFYING" });
      const verification = await verifyTool(workOrder, running, result); if (!verification.verified) throw new Error(`Verification failed: ${step.tool}`);
      const evidence = await receipt(workOrder, running, result, true, verification.detail);
      const done = { ...running, status: "DONE" as const, output: result.output, evidence, completedAt: now() };
      workOrder = await saveWorkOrder({ ...workOrder, steps: workOrder.steps.map((item) => item.id === step.id ? done : item) });
      await event(workOrder, "STEP_COMPLETED", actor, done, { receiptId: evidence.receiptId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error); const retry = attempts < running.maxAttempts;
      const failed = { ...running, status: "FAILED" as const, error: message };
      workOrder = await saveWorkOrder({ ...workOrder, status: retry ? "RETRY" : "ESCALATED",
        steps: workOrder.steps.map((item) => item.id === step.id ? failed : item), error: message });
      await event(workOrder, retry ? "STEP_RETRY" : "STEP_ESCALATED", actor, failed, { error: message, attempts }); return workOrder;
    }
  }
  const margin = workOrder.steps.find((item) => item.tool === "calculate_margin")?.output || {};
  const exception = margin.marginAlert === true;
  workOrder = await saveWorkOrder({ ...workOrder, status: exception ? "ESCALATED" : "DONE",
    result: { completedSteps: workOrder.steps.filter((item) => item.status === "DONE").length, totalSteps: workOrder.steps.length, margin, exception: exception ? "LOW_MARGIN" : null },
    error: exception ? "Gross margin is below the minimum." : null, completedAt: exception ? null : now() });
  await event(workOrder, exception ? "WORK_ORDER_ESCALATED" : "WORK_ORDER_COMPLETED", actor, undefined, workOrder.result || {}); return workOrder;
}

export type OrderToCashInput = {
  tenantId: string; orderId: string; customerName: string; customerEmail?: string; productName: string; sku: string;
  quantity: number; amountSAR: number; taxSAR?: number; unitCostSAR?: number; minimumMarginPercent?: number;
  paymentConfirmed: boolean; paymentReference?: string; channel?: string; requestedBy?: string; unavailableEmployeeIds?: string[];
};

function makeStep(sequence: number, employeeId: string, capability: string, tool: string, title: string, input: Record<string, unknown>): WorkOrderStep {
  return { id: `S${String(sequence).padStart(2, "0")}-${tool}`, sequence, title, capability, tool, employeeId,
    status: "PENDING", attempts: 0, maxAttempts: 3, input: { ...input, commitmentSAR: 0 }, output: null, evidence: null };
}

export async function runOrderToCash(raw: OrderToCashInput) {
  const tenantId = normalizeTenantId(requiredString(raw.tenantId, "tenantId")); const orderId = requiredString(raw.orderId, "orderId");
  const input = { orderId, customerName: requiredString(raw.customerName, "customerName"), customerEmail: raw.customerEmail || null,
    productName: requiredString(raw.productName, "productName"), sku: requiredString(raw.sku, "sku"), quantity: requiredNumber(raw.quantity, "quantity"),
    amountSAR: requiredNumber(raw.amountSAR, "amountSAR"), taxSAR: requiredNumber(raw.taxSAR || 0, "taxSAR", true),
    unitCostSAR: requiredNumber(raw.unitCostSAR || 0, "unitCostSAR", true), minimumMarginPercent: Number(raw.minimumMarginPercent || 20),
    paymentConfirmed: raw.paymentConfirmed === true, paymentReference: raw.paymentReference || orderId, channel: raw.channel || "direct" };
  if (Number(input.taxSAR) >= Number(input.amountSAR)) throw new Error("taxSAR must be lower than amountSAR.");
  const idempotencyKey = `order-to-cash:${tenantId}:${orderId}`; const key = `${tenantId}:${idempotencyKey}`; const supabase = getSupabaseAdmin();
  let existing: WorkOrder | null = null;
  if (supabase) { const result = await supabase.from("employee_work_orders").select("*").eq("tenant_id", tenantId).eq("idempotency_key", idempotencyKey).maybeSingle(); if (result.data) existing = rowToWorkOrder(result.data as Record<string, unknown>); }
  else { const id = memoryKeys.get(key); if (id) existing = memory.get(id) || null; }
  if (existing) return { workOrder: await executeWorkOrder(existing, raw.requestedBy || "system", raw.unavailableEmployeeIds || []), reused: true };
  const projectNumber = createProjectNumber(idempotencyKey); const steps = [
    makeStep(1, "sara", "VERIFY_ORDER", "verify_payment", "التحقق من الطلب والدفع", input),
    makeStep(2, "sara", "RECORD_SALE", "record_sale", "تسجيل عملية البيع", input),
    makeStep(3, "ameen", "CREATE_SALES_INVOICE", "create_sales_invoice", "إنشاء الفاتورة والقيد", input),
    makeStep(4, "khalid", "RESERVE_INVENTORY", "reserve_inventory", "حجز المخزون", input),
    makeStep(5, "fahad", "CREATE_FULFILLMENT_ORDER", "create_fulfillment_order", "إنشاء أمر التجهيز", input),
    makeStep(6, "sara", "UPDATE_CRM", "update_crm", "تحديث CRM", input),
    makeStep(7, "abdulrahman", "REVIEW_MARGIN", "calculate_margin", "فحص هامش الربح", input),
    makeStep(8, "hares", "CREATE_AUDIT_EVENT", "update_kpi", "تحديث KPI ودليل الإتمام", input),
  ];
  const createdAt = now(); const workOrder: WorkOrder = { id: randomUUID(), tenantId, projectNumber,
    workOrderNumber: createWorkOrderNumber(projectNumber), kind: "ORDER_TO_CASH", title: `تنفيذ بيع — ${orderId}`,
    objective: `إتمام دورة البيع ${orderId} من الدفع حتى المحاسبة والمخزون والتجهيز وCRM.`, requestedBy: raw.requestedBy || "system",
    ownerEmployeeId: "sara", backupEmployeeId: "noura", department: "المبيعات", amountSAR: Number(input.amountSAR),
    riskLevel: "LOW" as EmployeeRiskLevel, status: "RECEIVED", executionMode: "SIMULATION", requiresApproval: false,
    approvalTier: "T0", approvalStatus: "NOT_REQUIRED", idempotencyKey,
    acceptanceCriteria: ["الدفع مؤكد", "البيع مسجل مرة واحدة", "الفاتورة والقيد موجودان", "المخزون محجوز", "أمر التجهيز موجود", "CRM محدث", "الهامش مفحوص", "كل خطوة تحمل إيصالًا"],
    steps, context: { workflowVersion: "employee-runtime-v1", order: input }, result: null, error: null,
    createdAt, updatedAt: createdAt, startedAt: null, completedAt: null };
  memoryKeys.set(key, workOrder.id); await saveWorkOrder(workOrder);
  return { workOrder: await executeWorkOrder(workOrder, raw.requestedBy || "system", raw.unavailableEmployeeIds || []), reused: false };
}
