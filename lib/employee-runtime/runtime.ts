import { createHash, randomUUID } from "node:crypto";
import { createAccountingInvoiceAtomic } from "../accountingRepository";
import { effectiveTier } from "../company/governance";
import { executeApprovedIdea } from "../company/ideaExecution";
import { authorizeActionDuringOwnerAbsence } from "../company/ownerAbsence";
import { getSupabaseAdmin } from "../supabase";
import { normalizeTenantId } from "../tenant";
import {
  canExecuteCapability,
  requireEmployeeProfile,
  resolveActiveEmployee,
} from "./registry";
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
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, name: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredNumber(value: unknown, name: string, allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new Error(`${name} is invalid.`);
  }
  return round2(number);
}

function requiredInteger(value: unknown, name: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

export function createProjectNumber(seed: string, date = new Date()) {
  return `PRJ-${date.getUTCFullYear()}-${hash(seed).slice(0, 6).toUpperCase()}`;
}

export function createWorkOrderNumber(projectNumber: string, sequence = 1) {
  return `${projectNumber}/${String(sequence).padStart(3, "0")}`;
}

/** Live side effects require an explicit server-side opt-in. */
export function resolveEmployeeRuntimeMode(): ExecutionMode {
  const requested = String(process.env.EMPLOYEE_RUNTIME_MODE || "simulation")
    .trim()
    .toLowerCase();
  return requested === "live" && getSupabaseAdmin() ? "LIVE" : "SIMULATION";
}

function rowToWorkOrder(row: Record<string, unknown>): WorkOrder {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectNumber: String(row.project_number),
    workOrderNumber: String(row.work_order_number),
    kind: String(row.kind) as WorkOrder["kind"],
    title: String(row.title),
    objective: String(row.objective),
    requestedBy: String(row.requested_by),
    ownerEmployeeId: String(row.owner_employee_id),
    backupEmployeeId: row.backup_employee_id ? String(row.backup_employee_id) : null,
    department: String(row.department),
    amountSAR: Number(row.amount_sar || 0),
    riskLevel: String(row.risk_level || "LOW") as WorkOrder["riskLevel"],
    status: String(row.status) as WorkOrderStatus,
    executionMode: String(row.execution_mode || "SIMULATION") as WorkOrder["executionMode"],
    requiresApproval: row.requires_approval === true,
    approvalTier: String(row.approval_tier || "T0") as WorkOrder["approvalTier"],
    approvalStatus: String(row.approval_status || "NOT_REQUIRED") as WorkOrder["approvalStatus"],
    idempotencyKey: String(row.idempotency_key),
    acceptanceCriteria: Array.isArray(row.acceptance_criteria) ? row.acceptance_criteria.map(String) : [],
    steps: Array.isArray(row.steps) ? (row.steps as WorkOrderStep[]) : [],
    context: asRecord(row.context),
    result: Object.keys(asRecord(row.result)).length ? asRecord(row.result) : null,
    error: optionalString(row.error),
    createdAt: String(row.created_at || now()),
    updatedAt: String(row.updated_at || now()),
    startedAt: optionalString(row.started_at),
    completedAt: optionalString(row.completed_at),
  };
}

function workOrderRow(workOrder: WorkOrder) {
  return {
    id: workOrder.id,
    tenant_id: workOrder.tenantId,
    project_number: workOrder.projectNumber,
    work_order_number: workOrder.workOrderNumber,
    kind: workOrder.kind,
    title: workOrder.title,
    objective: workOrder.objective,
    requested_by: workOrder.requestedBy,
    owner_employee_id: workOrder.ownerEmployeeId,
    backup_employee_id: workOrder.backupEmployeeId || null,
    department: workOrder.department,
    amount_sar: workOrder.amountSAR,
    risk_level: workOrder.riskLevel,
    status: workOrder.status,
    execution_mode: workOrder.executionMode,
    requires_approval: workOrder.requiresApproval,
    approval_tier: workOrder.approvalTier,
    approval_status: workOrder.approvalStatus,
    idempotency_key: workOrder.idempotencyKey,
    acceptance_criteria: workOrder.acceptanceCriteria,
    steps: workOrder.steps,
    context: workOrder.context,
    result: workOrder.result || null,
    error: workOrder.error || null,
    created_at: workOrder.createdAt,
    updated_at: workOrder.updatedAt,
    started_at: workOrder.startedAt || null,
    completed_at: workOrder.completedAt || null,
  };
}

export async function saveWorkOrder(workOrder: WorkOrder): Promise<WorkOrder> {
  const updated = { ...workOrder, updatedAt: now() };
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    memory.set(updated.id, updated);
    return updated;
  }
  const { data, error } = await supabase
    .from("employee_work_orders")
    .upsert(workOrderRow(updated), { onConflict: "id" })
    .select("*")
    .single();
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
  const tenant = normalizeTenantId(tenantId);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...memory.values()]
      .filter((item) => item.tenantId === tenant)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }
  const { data, error } = await supabase
    .from("employee_work_orders")
    .select("*")
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(`Unable to list work orders: ${error.message}`);
  return (data || []).map((item: unknown) => rowToWorkOrder(item as Record<string, unknown>));
}

async function findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<WorkOrder | null> {
  const supabase = getSupabaseAdmin();
  const memoryId = memoryKeys.get(`${tenantId}:${idempotencyKey}`);
  if (!supabase) return memoryId ? memory.get(memoryId) || null : null;
  const { data, error } = await supabase
    .from("employee_work_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`Unable to check work-order idempotency: ${error.message}`);
  return data ? rowToWorkOrder(data as Record<string, unknown>) : null;
}

async function recordEvent(workOrder: WorkOrder, eventType: string, actor: string, step?: WorkOrderStep, detail: Record<string, unknown> = {}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from("employee_work_order_events").insert({
    tenant_id: workOrder.tenantId,
    work_order_id: workOrder.id,
    event_type: eventType,
    actor,
    employee_id: step?.employeeId || null,
    step_id: step?.id || null,
    detail,
  });
  if (error) throw new Error(`Unable to record work-order event: ${error.message}`);
}

async function createReceipt(workOrder: WorkOrder, step: WorkOrderStep, result: ToolExecutionResult, verification: Record<string, unknown>): Promise<ExecutionEvidence> {
  const inputHash = hash(step.input);
  const evidence: ExecutionEvidence = {
    receiptId: hash(`${workOrder.id}:${step.id}:${step.attempts}:${inputHash}`).slice(0, 40),
    workOrderId: workOrder.id,
    workOrderNumber: workOrder.workOrderNumber,
    stepId: step.id,
    employeeId: step.employeeId,
    tool: step.tool,
    mode: workOrder.executionMode,
    inputHash,
    providerReference: result.providerReference || null,
    verified: true,
    reconciliationStatus: result.reconciliationStatus || "NOT_REQUIRED",
    details: {
      tenantId: workOrder.tenantId,
      delegatedFromEmployeeId: optionalString(step.input.delegatedFromEmployeeId) || null,
      output: result.output,
      verification,
    },
    createdAt: now(),
  };
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("employee_execution_receipts").upsert({
      id: evidence.receiptId,
      tenant_id: workOrder.tenantId,
      work_order_id: workOrder.id,
      work_order_number: workOrder.workOrderNumber,
      step_id: step.id,
      employee_id: step.employeeId,
      tool: step.tool,
      mode: workOrder.executionMode,
      input_hash: inputHash,
      provider_reference: evidence.providerReference,
      verified: true,
      reconciliation_status: evidence.reconciliationStatus,
      details: evidence.details,
      created_at: evidence.createdAt,
    }, { onConflict: "id" });
    if (error) throw new Error(`Unable to persist execution receipt: ${error.message}`);
  }
  return evidence;
}

export async function evaluateRuntimePolicy(workOrder: WorkOrder, step: WorkOrderStep): Promise<RuntimePolicyDecision> {
  const delegatedFromEmployeeId = optionalString(step.input.delegatedFromEmployeeId) || undefined;
  const principalId = delegatedFromEmployeeId || step.employeeId;
  const principal = requireEmployeeProfile(principalId);
  const controls = ["idempotency", "verification", "receipt", "audit", ...(delegatedFromEmployeeId ? ["temporary_delegation"] : [])];
  const reasons: string[] = [];
  if (!canExecuteCapability({ activeEmployeeId: step.employeeId, capability: step.capability, delegatedFromEmployeeId })) {
    return {
      allowed: false,
      autonomous: false,
      approvalTier: "T2",
      approvalRequired: true,
      approverEmployeeId: "owner",
      reasons: [delegatedFromEmployeeId ? `التفويض من ${delegatedFromEmployeeId} إلى ${step.employeeId} غير صالح لهذه القدرة.` : `${principal.name} لا يملك ${step.capability}.`],
      controls,
    };
  }
  const commitmentSAR = Math.max(0, Number(step.input.commitmentSAR || 0));
  const tier = effectiveTier(commitmentSAR || 0.01, workOrder.riskLevel);
  const riskOk = RISK[workOrder.riskLevel] <= RISK[principal.maxAutonomousRisk];
  const amountOk = commitmentSAR === 0 || commitmentSAR <= principal.authorityLimitSAR;
  let autonomous = tier.tier === "T0" && riskOk && amountOk;
  if (delegatedFromEmployeeId) reasons.push(`تفويض مؤقت موثق من ${delegatedFromEmployeeId} إلى ${step.employeeId}.`);
  if (!riskOk) reasons.push("مستوى المخاطر أعلى من حد الدور الأصلي.");
  if (!amountOk) reasons.push("الالتزام المالي أعلى من حد الدور الأصلي.");
  if (tier.tier !== "T0") reasons.push(`مطلوب اعتماد ${tier.tier}.`);
  const absence = await authorizeActionDuringOwnerAbsence({
    id: workOrder.id,
    project_id: workOrder.projectNumber,
    action_type: step.capability,
    execution_mode: workOrder.executionMode,
    provider: step.tool,
    requires_approval: !autonomous,
    approval_status: workOrder.approvalStatus,
    payload: {
      amountSAR: commitmentSAR,
      riskLevel: workOrder.riskLevel,
      external: workOrder.executionMode === "LIVE",
      delegatedFromEmployeeId: delegatedFromEmployeeId || null,
    },
  }, workOrder.tenantId);
  if (!absence.decision.allowed) {
    autonomous = false;
    reasons.push(...absence.decision.reasons);
  }
  const approvalRequired = !autonomous;
  const approverEmployeeId = tier.tier === "T0" ? principalId : tier.tier === "T1" ? "sultan" : "owner";
  const allowed = absence.decision.allowed && (!approvalRequired || workOrder.approvalStatus === "APPROVED");
  if (!allowed && approvalRequired) reasons.push(`بانتظار اعتماد ${approverEmployeeId}.`);
  return {
    allowed,
    autonomous,
    approvalTier: tier.tier,
    approvalRequired,
    approverEmployeeId,
    reasons: reasons.length ? [...new Set(reasons)] : ["ضمن الصلاحية."],
    controls: [...new Set([...controls, ...absence.decision.controls])],
  };
}

function simulatedResult(workOrder: WorkOrder, step: WorkOrderStep, operation: string, output: Record<string, unknown>): ToolExecutionResult {
  return {
    output: { simulated: true, operation, ...output },
    providerReference: `sim:${workOrder.id}:${step.id}`,
    reconciliationStatus: "NOT_REQUIRED",
  };
}

async function executeTool(workOrder: WorkOrder, step: WorkOrderStep, actor: string): Promise<ToolExecutionResult> {
  const input = step.input;
  const supabase = getSupabaseAdmin();
  if (step.tool === "verify_payment") {
    if (input.paymentConfirmed !== true) throw new Error("Payment is not confirmed.");
    const reference = requiredString(input.paymentReference || input.orderId, "paymentReference");
    return { output: { paymentConfirmed: true, orderId: input.orderId, amountSAR: input.amountSAR }, providerReference: reference, reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "calculate_margin") {
    const amount = requiredNumber(input.amountSAR, "amountSAR");
    const quantity = requiredInteger(input.quantity, "quantity");
    const unitCost = requiredNumber(input.unitCostSAR || 0, "unitCostSAR", true);
    const cost = round2(unitCost * quantity);
    const profit = round2(amount - cost);
    const marginPercent = round2((profit / amount) * 100);
    const minimum = requiredNumber(input.minimumMarginPercent || 20, "minimumMarginPercent", true);
    return {
      output: {
        amountSAR: amount,
        costSAR: cost,
        grossProfitSAR: profit,
        marginPercent,
        marginAlert: marginPercent < minimum,
        exception: marginPercent < minimum ? "LOW_MARGIN" : null,
      },
      providerReference: String(input.orderId),
      reconciliationStatus: "MATCHED",
    };
  }
  if (step.tool === "evaluate_supplier") {
    const quotedPrice = requiredNumber(input.totalSAR, "totalSAR");
    const leadDays = requiredInteger(input.leadTimeDays || 7, "leadTimeDays");
    const qualityScore = Math.min(100, Math.max(0, Number(input.qualityScore || 80)));
    const supplierScore = round2(qualityScore * 0.6 + Math.max(0, 100 - leadDays * 3) * 0.25 + (quotedPrice > 0 ? 15 : 0));
    return {
      output: {
        supplierName: input.supplierName,
        supplierScore,
        approvedForOrder: supplierScore >= 60,
        exception: supplierScore < 60 ? "LOW_SUPPLIER_SCORE" : null,
      },
      providerReference: String(input.requestId),
      reconciliationStatus: "MATCHED",
    };
  }
  if (step.tool === "validate_approved_idea") {
    if (input.approved !== true) throw new Error("The idea is not approved.");
    return {
      output: {
        ideaId: requiredString(input.ideaId, "ideaId"),
        approved: true,
        budgetSAR: requiredNumber(input.budgetSAR || 0.01, "budgetSAR"),
      },
      providerReference: String(input.ideaId),
      reconciliationStatus: "MATCHED",
    };
  }
  if (workOrder.executionMode === "SIMULATION") {
    return simulatedResult(workOrder, step, step.tool, {
      reference: input.orderId || input.requestId || input.ideaId || workOrder.id,
    });
  }
  if (!supabase) throw new Error("Supabase is required for live execution.");
  if (step.tool === "record_sale") {
    const { data, error } = await supabase.from("employee_sales_orders").upsert({
      tenant_id: workOrder.tenantId,
      order_id: requiredString(input.orderId, "orderId"),
      work_order_id: workOrder.id,
      customer_name: requiredString(input.customerName, "customerName"),
      customer_email: optionalString(input.customerEmail),
      product_name: requiredString(input.productName, "productName"),
      sku: requiredString(input.sku, "sku"),
      quantity: requiredInteger(input.quantity, "quantity"),
      amount_sar: requiredNumber(input.amountSAR, "amountSAR"),
      channel: String(input.channel || "direct"),
      payment_reference: requiredString(input.paymentReference || input.orderId, "paymentReference"),
      status: "PAID",
      updated_at: now(),
    }, { onConflict: "tenant_id,order_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return { output: { sale: data }, providerReference: String(input.orderId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "create_sales_invoice") {
    const total = requiredNumber(input.amountSAR, "amountSAR");
    const tax = requiredNumber(input.taxSAR || 0, "taxSAR", true);
    const invoice = await createAccountingInvoiceAtomic({
      invoiceType: "SALES",
      contactName: requiredString(input.customerName, "customerName"),
      subtotal: round2(total - tax),
      tax,
      notes: `Order ${String(input.orderId)} / ${workOrder.workOrderNumber}`,
      idempotencyKey: `employee-runtime:sales:${workOrder.tenantId}:${String(input.orderId)}`,
    });
    return { output: { invoice }, providerReference: String(asRecord(invoice).invoiceId || input.orderId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "reserve_inventory") {
    const { data, error } = await supabase.rpc("orvanta_reserve_employee_inventory", {
      p_tenant_id: workOrder.tenantId,
      p_sku: requiredString(input.sku, "sku"),
      p_quantity: requiredInteger(input.quantity, "quantity"),
      p_work_order_id: workOrder.id,
      p_order_id: String(input.orderId),
    });
    if (error) throw new Error(error.message);
    return { output: { reservation: data }, providerReference: `${String(input.sku)}:${String(input.orderId)}`, reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "create_fulfillment_order") {
    const { data, error } = await supabase.from("employee_fulfillment_orders").upsert({
      tenant_id: workOrder.tenantId,
      order_id: requiredString(input.orderId, "orderId"),
      work_order_id: workOrder.id,
      customer_name: requiredString(input.customerName, "customerName"),
      product_name: requiredString(input.productName, "productName"),
      sku: requiredString(input.sku, "sku"),
      quantity: requiredInteger(input.quantity, "quantity"),
      status: "READY_TO_PICK",
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      updated_at: now(),
    }, { onConflict: "tenant_id,order_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return { output: { fulfillment: data }, providerReference: String(asRecord(data).id || input.orderId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "update_crm") {
    const customerKey = String(input.customerEmail || `${String(input.customerName)}:${String(input.orderId)}`);
    const { data, error } = await supabase.rpc("orvanta_upsert_employee_customer", {
      p_tenant_id: workOrder.tenantId,
      p_customer_key: customerKey,
      p_name: requiredString(input.customerName, "customerName"),
      p_email: optionalString(input.customerEmail),
      p_order_id: String(input.orderId),
      p_order_amount: requiredNumber(input.amountSAR, "amountSAR"),
      p_channel: String(input.channel || "direct"),
    });
    if (error) throw new Error(error.message);
    return { output: { customer: data }, providerReference: customerKey, reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "create_purchase_order") {
    const { data, error } = await supabase.from("employee_purchase_orders").upsert({
      tenant_id: workOrder.tenantId,
      request_id: requiredString(input.requestId, "requestId"),
      work_order_id: workOrder.id,
      supplier_name: requiredString(input.supplierName, "supplierName"),
      supplier_email: optionalString(input.supplierEmail),
      item_name: requiredString(input.itemName, "itemName"),
      sku: requiredString(input.sku, "sku"),
      quantity: requiredInteger(input.quantity, "quantity"),
      unit_price_sar: requiredNumber(input.unitPriceSAR, "unitPriceSAR"),
      subtotal_sar: requiredNumber(input.subtotalSAR, "subtotalSAR"),
      tax_sar: requiredNumber(input.taxSAR || 0, "taxSAR", true),
      total_sar: requiredNumber(input.totalSAR, "totalSAR"),
      status: "APPROVED",
      updated_at: now(),
    }, { onConflict: "tenant_id,request_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return { output: { purchaseOrder: data }, providerReference: String(asRecord(data).id || input.requestId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "record_goods_receipt") {
    if (input.received !== true) throw new Error("Goods receipt is not confirmed.");
    const { data, error } = await supabase.rpc("orvanta_receive_employee_inventory", {
      p_tenant_id: workOrder.tenantId,
      p_work_order_id: workOrder.id,
      p_request_id: requiredString(input.requestId, "requestId"),
      p_sku: requiredString(input.sku, "sku"),
      p_product_name: requiredString(input.itemName, "itemName"),
      p_quantity: requiredInteger(input.quantity, "quantity"),
      p_unit_cost_sar: requiredNumber(input.unitPriceSAR, "unitPriceSAR"),
    });
    if (error) throw new Error(error.message);
    return { output: { goodsReceipt: data }, providerReference: `${String(input.requestId)}:${String(input.sku)}`, reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "create_purchase_invoice") {
    const invoice = await createAccountingInvoiceAtomic({
      invoiceType: "PURCHASE",
      contactName: requiredString(input.supplierName, "supplierName"),
      subtotal: requiredNumber(input.subtotalSAR, "subtotalSAR"),
      tax: requiredNumber(input.taxSAR || 0, "taxSAR", true),
      notes: `Purchase ${String(input.requestId)} / ${workOrder.workOrderNumber}`,
      idempotencyKey: `employee-runtime:purchase:${workOrder.tenantId}:${String(input.requestId)}`,
    });
    return { output: { invoice }, providerReference: String(asRecord(invoice).invoiceId || input.requestId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "schedule_payment") {
    const { data, error } = await supabase.from("employee_payables").upsert({
      tenant_id: workOrder.tenantId,
      request_id: requiredString(input.requestId, "requestId"),
      work_order_id: workOrder.id,
      supplier_name: requiredString(input.supplierName, "supplierName"),
      amount_sar: requiredNumber(input.totalSAR, "totalSAR"),
      due_date: optionalString(input.paymentDueDate) || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      status: "SCHEDULED",
      updated_at: now(),
    }, { onConflict: "tenant_id,request_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return {
      output: {
        payable: data,
        note: "The payment is scheduled only. No bank transfer is made without a bank connector and its approval gate.",
      },
      providerReference: String(asRecord(data).id || input.requestId),
      reconciliationStatus: "MATCHED",
    };
  }
  if (step.tool === "execute_approved_idea") {
    const execution = await executeApprovedIdea({ ideaId: requiredString(input.ideaId, "ideaId") }, actor);
    if (!execution.ok || !execution.saved) throw new Error(execution.reason || "Approved idea could not be persisted.");
    return { output: { execution }, providerReference: String(execution.project?.id || input.ideaId), reconciliationStatus: "MATCHED" };
  }
  if (step.tool === "update_kpi") {
    const workflowKey = String(input.orderId || input.requestId || input.ideaId || workOrder.id);
    const eventKey = `${workOrder.kind.toLowerCase()}:completed:${workflowKey}`;
    const { data, error } = await supabase.from("employee_kpi_events").upsert({
      tenant_id: workOrder.tenantId,
      event_key: eventKey,
      work_order_id: workOrder.id,
      employee_id: workOrder.ownerEmployeeId,
      kpi_id: String(input.kpiId || `${workOrder.kind.toLowerCase()}_success`),
      value: 1,
      unit: "COUNT",
      metadata: { workflowKey, amountSAR: workOrder.amountSAR, kind: workOrder.kind },
    }, { onConflict: "tenant_id,event_key" }).select("*").single();
    if (error) throw new Error(error.message);
    return { output: { kpiEvent: data }, providerReference: eventKey, reconciliationStatus: "MATCHED" };
  }
  throw new Error(`Tool not implemented: ${step.tool}`);
}

async function verifyTool(workOrder: WorkOrder, step: WorkOrderStep, result: ToolExecutionResult) {
  if (workOrder.executionMode === "SIMULATION") return { verified: true, detail: { simulated: true } };
  if (["verify_payment", "calculate_margin", "evaluate_supplier", "validate_approved_idea"].includes(step.tool)) {
    return { verified: Boolean(result.providerReference), detail: result.output };
  }
  return { verified: Boolean(result.providerReference), detail: { providerReference: result.providerReference || null } };
}

function prepareDelegatedStep(original: WorkOrderStep, unavailableEmployeeIds: string[]): WorkOrderStep {
  const principalEmployeeId = optionalString(original.input.principalEmployeeId) || original.employeeId;
  const active = resolveActiveEmployee(principalEmployeeId, unavailableEmployeeIds);
  return {
    ...original,
    employeeId: active.id,
    input: {
      ...original.input,
      principalEmployeeId,
      delegatedFromEmployeeId: active.id === principalEmployeeId ? null : principalEmployeeId,
    },
  };
}

export async function executeWorkOrder(initial: WorkOrder, actor = "employee-runtime", unavailableEmployeeIds: string[] = []): Promise<WorkOrder> {
  if (["DONE", "CANCELLED", "ROLLED_BACK"].includes(initial.status)) return initial;
  let workOrder = await saveWorkOrder({
    ...initial,
    status: "PLANNED",
    executionMode: resolveEmployeeRuntimeMode(),
    startedAt: initial.startedAt || now(),
    error: null,
  });
  await recordEvent(workOrder, "WORK_ORDER_PLANNED", actor);
  for (const original of [...workOrder.steps].sort((left, right) => left.sequence - right.sequence)) {
    if (["DONE", "SKIPPED"].includes(original.status)) continue;
    const step = prepareDelegatedStep(original, unavailableEmployeeIds);
    workOrder = await saveWorkOrder({ ...workOrder, status: "POLICY_CHECK" });
    const policy = await evaluateRuntimePolicy(workOrder, step);
    await recordEvent(workOrder, policy.allowed ? "POLICY_ALLOWED" : "POLICY_BLOCKED", actor, step, policy as unknown as Record<string, unknown>);
    if (!policy.allowed) {
      return saveWorkOrder({
        ...workOrder,
        status: policy.approvalRequired ? "WAITING_APPROVAL" : "ESCALATED",
        requiresApproval: policy.approvalRequired,
        approvalTier: policy.approvalTier,
        approvalStatus: policy.approvalRequired ? "PENDING" : workOrder.approvalStatus,
        error: policy.reasons.join(" "),
      });
    }
    const attempts = original.attempts + 1;
    const running: WorkOrderStep = {
      ...step,
      attempts,
      status: "RUNNING",
      startedAt: step.startedAt || now(),
      error: null,
    };
    workOrder = await saveWorkOrder({
      ...workOrder,
      status: "EXECUTING",
      steps: workOrder.steps.map((item) => item.id === step.id ? running : item),
      error: null,
    });
    try {
      const result = await executeTool(workOrder, running, actor);
      workOrder = await saveWorkOrder({ ...workOrder, status: "VERIFYING" });
      const verification = await verifyTool(workOrder, running, result);
      if (!verification.verified) throw new Error(`Verification failed: ${step.tool}`);
      const evidence = await createReceipt(workOrder, running, result, verification.detail);
      const done: WorkOrderStep = {
        ...running,
        status: "DONE",
        output: result.output,
        evidence,
        completedAt: now(),
      };
      workOrder = await saveWorkOrder({
        ...workOrder,
        steps: workOrder.steps.map((item) => item.id === step.id ? done : item),
      });
      await recordEvent(workOrder, "STEP_COMPLETED", actor, done, { receiptId: evidence.receiptId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retry = attempts < running.maxAttempts;
      const failed: WorkOrderStep = { ...running, status: "FAILED", error: message };
      workOrder = await saveWorkOrder({
        ...workOrder,
        status: retry ? "RETRY" : "ESCALATED",
        steps: workOrder.steps.map((item) => item.id === step.id ? failed : item),
        error: message,
      });
      await recordEvent(workOrder, retry ? "STEP_RETRY" : "STEP_ESCALATED", actor, failed, { error: message, attempts });
      return workOrder;
    }
  }
  const exceptions = workOrder.steps
    .map((step) => optionalString(asRecord(step.output).exception))
    .filter((value): value is string => Boolean(value));
  const exception = exceptions[0] || null;
  workOrder = await saveWorkOrder({
    ...workOrder,
    status: exception ? "ESCALATED" : "DONE",
    result: {
      completedSteps: workOrder.steps.filter((item) => item.status === "DONE").length,
      totalSteps: workOrder.steps.length,
      exceptions,
      workflow: workOrder.kind,
    },
    error: exception ? `Workflow exception: ${exception}` : null,
    completedAt: exception ? null : now(),
  });
  await recordEvent(workOrder, exception ? "WORK_ORDER_ESCALATED" : "WORK_ORDER_COMPLETED", actor, undefined, workOrder.result || {});
  return workOrder;
}

function makeStep(sequence: number, employeeId: string, capability: string, tool: string, title: string, input: Record<string, unknown>, commitmentSAR = 0): WorkOrderStep {
  return {
    id: `S${String(sequence).padStart(2, "0")}-${tool}`,
    sequence,
    title,
    capability,
    tool,
    employeeId,
    status: "PENDING",
    attempts: 0,
    maxAttempts: 3,
    input: { ...input, principalEmployeeId: employeeId, commitmentSAR },
    output: null,
    evidence: null,
  };
}

async function createAndRunWorkOrder(input: {
  tenantId: string;
  idempotencyKey: string;
  projectNumber?: string;
  kind: WorkOrder["kind"];
  title: string;
  objective: string;
  requestedBy: string;
  ownerEmployeeId: string;
  backupEmployeeId?: string | null;
  department: string;
  amountSAR: number;
  riskLevel: EmployeeRiskLevel;
  approvalStatus?: WorkOrder["approvalStatus"];
  acceptanceCriteria: string[];
  steps: WorkOrderStep[];
  context: Record<string, unknown>;
  unavailableEmployeeIds?: string[];
}) {
  const existing = await findByIdempotencyKey(input.tenantId, input.idempotencyKey);
  if (existing) {
    return {
      workOrder: await executeWorkOrder(existing, input.requestedBy, input.unavailableEmployeeIds || []),
      reused: true,
    };
  }
  const projectNumber = input.projectNumber || createProjectNumber(input.idempotencyKey);
  const createdAt = now();
  const workOrder: WorkOrder = {
    id: randomUUID(),
    tenantId: input.tenantId,
    projectNumber,
    workOrderNumber: createWorkOrderNumber(projectNumber),
    kind: input.kind,
    title: input.title,
    objective: input.objective,
    requestedBy: input.requestedBy,
    ownerEmployeeId: input.ownerEmployeeId,
    backupEmployeeId: input.backupEmployeeId || null,
    department: input.department,
    amountSAR: input.amountSAR,
    riskLevel: input.riskLevel,
    status: "RECEIVED",
    executionMode: "SIMULATION",
    requiresApproval: false,
    approvalTier: "T0",
    approvalStatus: input.approvalStatus || "NOT_REQUIRED",
    idempotencyKey: input.idempotencyKey,
    acceptanceCriteria: input.acceptanceCriteria,
    steps: input.steps,
    context: { ...input.context, runtimeVersion: "employee-runtime-v2" },
    result: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
  };
  memoryKeys.set(`${input.tenantId}:${input.idempotencyKey}`, workOrder.id);
  await saveWorkOrder(workOrder);
  return {
    workOrder: await executeWorkOrder(workOrder, input.requestedBy, input.unavailableEmployeeIds || []),
    reused: false,
  };
}

export type OrderToCashInput = {
  tenantId: string;
  orderId: string;
  customerName: string;
  customerEmail?: string;
  productName: string;
  sku: string;
  quantity: number;
  amountSAR: number;
  taxSAR?: number;
  unitCostSAR?: number;
  minimumMarginPercent?: number;
  paymentConfirmed: boolean;
  paymentReference?: string;
  channel?: string;
  requestedBy?: string;
  unavailableEmployeeIds?: string[];
};

export async function runOrderToCash(raw: OrderToCashInput) {
  const tenantId = normalizeTenantId(requiredString(raw.tenantId, "tenantId"));
  const orderId = requiredString(raw.orderId, "orderId");
  const amountSAR = requiredNumber(raw.amountSAR, "amountSAR");
  const taxSAR = requiredNumber(raw.taxSAR || 0, "taxSAR", true);
  if (taxSAR >= amountSAR) throw new Error("taxSAR must be lower than amountSAR.");
  const input = {
    orderId,
    customerName: requiredString(raw.customerName, "customerName"),
    customerEmail: optionalString(raw.customerEmail),
    productName: requiredString(raw.productName, "productName"),
    sku: requiredString(raw.sku, "sku"),
    quantity: requiredInteger(raw.quantity, "quantity"),
    amountSAR,
    taxSAR,
    unitCostSAR: requiredNumber(raw.unitCostSAR || 0, "unitCostSAR", true),
    minimumMarginPercent: requiredNumber(raw.minimumMarginPercent || 20, "minimumMarginPercent", true),
    paymentConfirmed: raw.paymentConfirmed === true,
    paymentReference: requiredString(raw.paymentReference || orderId, "paymentReference"),
    channel: raw.channel || "direct",
  };
  return createAndRunWorkOrder({
    tenantId,
    idempotencyKey: `order-to-cash:${tenantId}:${orderId}`,
    kind: "ORDER_TO_CASH",
    title: `تنفيذ بيع — ${orderId}`,
    objective: `إتمام دورة البيع ${orderId} من الدفع حتى المحاسبة والمخزون والتجهيز وCRM.`,
    requestedBy: raw.requestedBy || "system",
    ownerEmployeeId: "sara",
    backupEmployeeId: "noura",
    department: "المبيعات",
    amountSAR,
    riskLevel: "LOW",
    acceptanceCriteria: ["الدفع مؤكد بمرجع", "البيع مسجل مرة واحدة", "الفاتورة والقيد موجودان", "المخزون محجوز", "أمر التجهيز موجود", "CRM محدث", "الهامش مفحوص", "كل خطوة تحمل إيصالًا"],
    steps: [
      makeStep(1, "sara", "VERIFY_ORDER", "verify_payment", "التحقق من الطلب والدفع", input),
      makeStep(2, "sara", "RECORD_SALE", "record_sale", "تسجيل عملية البيع", input),
      makeStep(3, "ameen", "CREATE_SALES_INVOICE", "create_sales_invoice", "إنشاء الفاتورة والقيد", input),
      makeStep(4, "khalid", "RESERVE_INVENTORY", "reserve_inventory", "حجز المخزون", input),
      makeStep(5, "fahad", "CREATE_FULFILLMENT_ORDER", "create_fulfillment_order", "إنشاء أمر التجهيز", input),
      makeStep(6, "sara", "UPDATE_CRM", "update_crm", "تحديث CRM", input),
      makeStep(7, "abdulrahman", "REVIEW_MARGIN", "calculate_margin", "فحص هامش الربح", input),
      makeStep(8, "hares", "CREATE_AUDIT_EVENT", "update_kpi", "تحديث KPI ودليل الإتمام", { ...input, kpiId: "order_to_cash_success" }),
    ],
    context: { order: input },
    unavailableEmployeeIds: raw.unavailableEmployeeIds,
  });
}

export type PurchaseToPayInput = {
  tenantId: string;
  requestId: string;
  supplierName: string;
  supplierEmail?: string;
  itemName: string;
  sku: string;
  quantity: number;
  unitPriceSAR: number;
  taxSAR?: number;
  leadTimeDays?: number;
  qualityScore?: number;
  received: boolean;
  paymentDueDate?: string;
  approved?: boolean;
  requestedBy?: string;
  unavailableEmployeeIds?: string[];
};

export async function runPurchaseToPay(raw: PurchaseToPayInput) {
  const tenantId = normalizeTenantId(requiredString(raw.tenantId, "tenantId"));
  const requestId = requiredString(raw.requestId, "requestId");
  const quantity = requiredInteger(raw.quantity, "quantity");
  const unitPriceSAR = requiredNumber(raw.unitPriceSAR, "unitPriceSAR");
  const subtotalSAR = round2(quantity * unitPriceSAR);
  const taxSAR = requiredNumber(raw.taxSAR || 0, "taxSAR", true);
  const totalSAR = round2(subtotalSAR + taxSAR);
  const input = {
    requestId,
    supplierName: requiredString(raw.supplierName, "supplierName"),
    supplierEmail: optionalString(raw.supplierEmail),
    itemName: requiredString(raw.itemName, "itemName"),
    sku: requiredString(raw.sku, "sku"),
    quantity,
    unitPriceSAR,
    subtotalSAR,
    taxSAR,
    totalSAR,
    leadTimeDays: requiredInteger(raw.leadTimeDays || 7, "leadTimeDays"),
    qualityScore: Math.min(100, Math.max(0, Number(raw.qualityScore || 80))),
    received: raw.received === true,
    paymentDueDate: optionalString(raw.paymentDueDate),
  };
  return createAndRunWorkOrder({
    tenantId,
    idempotencyKey: `purchase-to-pay:${tenantId}:${requestId}`,
    kind: "PURCHASE_TO_PAY",
    title: `طلب شراء — ${requestId}`,
    objective: `اختيار المورد وإصدار أمر الشراء والاستلام والفاتورة وجدولة السداد للطلب ${requestId}.`,
    requestedBy: raw.requestedBy || "system",
    ownerEmployeeId: "khalid",
    backupEmployeeId: "fahad",
    department: "المشتريات",
    amountSAR: totalSAR,
    riskLevel: totalSAR > 100_000 ? "HIGH" : "MEDIUM",
    approvalStatus: raw.approved ? "APPROVED" : "NOT_REQUIRED",
    acceptanceCriteria: ["المورد مجتاز للتقييم", "أمر الشراء مسجل مرة واحدة", "الاستلام مؤكد ومضاف للمخزون", "فاتورة الشراء والقيد موجودان", "المستحق مجدول دون تحويل بنكي غير مصرح", "كل خطوة تحمل إيصالًا"],
    steps: [
      makeStep(1, "khalid", "COMPARE_SUPPLIERS", "evaluate_supplier", "تقييم المورد والعرض", input),
      makeStep(2, "khalid", "CREATE_PURCHASE_ORDER", "create_purchase_order", "إنشاء أمر الشراء", input, totalSAR),
      makeStep(3, "fahad", "RECORD_GOODS_RECEIPT", "record_goods_receipt", "تسجيل الاستلام وفحصه", input),
      makeStep(4, "ameen", "CREATE_PURCHASE_INVOICE", "create_purchase_invoice", "إنشاء فاتورة الشراء والقيد", input),
      makeStep(5, "abdulrahman", "RECONCILE_PAYMENT", "schedule_payment", "جدولة المستحق المالي", input, totalSAR),
      makeStep(6, "hares", "CREATE_AUDIT_EVENT", "update_kpi", "تحديث KPI ودليل الإتمام", { ...input, kpiId: "purchase_to_pay_success" }),
    ],
    context: { purchase: input },
    unavailableEmployeeIds: raw.unavailableEmployeeIds,
  });
}

export type IdeaToExecutionInput = {
  tenantId: string;
  ideaId: string;
  title?: string;
  budgetSAR: number;
  approved: boolean;
  riskLevel?: EmployeeRiskLevel;
  requestedBy?: string;
  unavailableEmployeeIds?: string[];
};

export async function runIdeaToExecution(raw: IdeaToExecutionInput) {
  const tenantId = normalizeTenantId(requiredString(raw.tenantId, "tenantId"));
  const ideaId = requiredString(raw.ideaId, "ideaId");
  const budgetSAR = requiredNumber(raw.budgetSAR || 0.01, "budgetSAR");
  const input = {
    ideaId,
    budgetSAR,
    approved: raw.approved === true,
    title: raw.title || ideaId,
  };
  return createAndRunWorkOrder({
    tenantId,
    idempotencyKey: `idea-to-execution:${tenantId}:${ideaId}`,
    kind: "IDEA_TO_EXECUTION",
    title: `تنفيذ فكرة — ${raw.title || ideaId}`,
    objective: `تحويل الفكرة المعتمدة ${ideaId} إلى مشروع ومهام وKPIs وإجراءات قابلة للتتبع.`,
    requestedBy: raw.requestedBy || "system",
    ownerEmployeeId: "fahad",
    backupEmployeeId: "khalid",
    department: "العمليات",
    amountSAR: budgetSAR,
    riskLevel: raw.riskLevel || "MEDIUM",
    approvalStatus: raw.approved ? "APPROVED" : "PENDING",
    acceptanceCriteria: ["الفكرة معتمدة", "المشروع محفوظ", "المهام وKPIs والإجراءات مولدة", "التحويل غير مكرر", "إيصال التنفيذ موجود"],
    steps: [
      makeStep(1, "sultan", "ROUTE_WORK", "validate_approved_idea", "التحقق من اعتماد الفكرة", input, budgetSAR),
      makeStep(2, "fahad", "CREATE_PROJECT", "execute_approved_idea", "إنشاء المشروع وحزمة التنفيذ", input, budgetSAR),
      makeStep(3, "hares", "CREATE_AUDIT_EVENT", "update_kpi", "تحديث KPI ودليل الإتمام", { ...input, kpiId: "idea_to_execution_success" }),
    ],
    context: { idea: input },
    unavailableEmployeeIds: raw.unavailableEmployeeIds,
  });
}
