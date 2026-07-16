export type EmployeeRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type WorkOrderStatus =
  | "RECEIVED"
  | "PLANNED"
  | "POLICY_CHECK"
  | "WAITING_APPROVAL"
  | "READY"
  | "EXECUTING"
  | "VERIFYING"
  | "RECONCILING"
  | "DONE"
  | "RETRY"
  | "ESCALATED"
  | "ROLLED_BACK"
  | "FAILED"
  | "CANCELLED";

export type WorkOrderKind =
  | "GENERIC"
  | "ORDER_TO_CASH"
  | "PURCHASE_TO_PAY"
  | "IDEA_TO_EXECUTION";

export type WorkOrderStepStatus =
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "SKIPPED";

export type ExecutionMode = "LIVE" | "SIMULATION";

export type WorkOrderStep = {
  id: string;
  sequence: number;
  title: string;
  capability: string;
  tool: string;
  employeeId: string;
  status: WorkOrderStepStatus;
  attempts: number;
  maxAttempts: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  evidence?: ExecutionEvidence | null;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type WorkOrder = {
  id: string;
  tenantId: string;
  projectNumber: string;
  workOrderNumber: string;
  kind: WorkOrderKind;
  title: string;
  objective: string;
  requestedBy: string;
  ownerEmployeeId: string;
  backupEmployeeId?: string | null;
  department: string;
  amountSAR: number;
  riskLevel: EmployeeRiskLevel;
  status: WorkOrderStatus;
  executionMode: ExecutionMode;
  requiresApproval: boolean;
  approvalTier: "T0" | "T1" | "T2" | "T3";
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  idempotencyKey: string;
  acceptanceCriteria: string[];
  steps: WorkOrderStep[];
  context: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type ExecutionEvidence = {
  receiptId: string;
  workOrderId: string;
  workOrderNumber: string;
  stepId: string;
  employeeId: string;
  tool: string;
  mode: ExecutionMode;
  inputHash: string;
  providerReference?: string | null;
  verified: boolean;
  reconciliationStatus: "NOT_REQUIRED" | "MATCHED" | "EXCEPTION";
  details: Record<string, unknown>;
  createdAt: string;
};

export type EmployeeKpiDefinition = {
  id: string;
  label: string;
  unit: "PERCENT" | "COUNT" | "SAR" | "SECONDS" | "RATIO";
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
  target: number;
  warningThreshold?: number;
  criticalThreshold?: number;
};

export type EmployeeProfile = {
  id: string;
  name: string;
  title: string;
  department: string;
  reportsTo: string | null;
  backupEmployeeId?: string | null;
  authorityLimitSAR: number;
  maxAutonomousRisk: Exclude<EmployeeRiskLevel, "CRITICAL">;
  capabilities: string[];
  sopIds: string[];
  kpis: EmployeeKpiDefinition[];
};

export type RuntimePolicyDecision = {
  allowed: boolean;
  autonomous: boolean;
  approvalTier: "T0" | "T1" | "T2" | "T3";
  approvalRequired: boolean;
  approverEmployeeId: string;
  reasons: string[];
  controls: string[];
};

export type ToolExecutionContext = {
  workOrder: WorkOrder;
  step: WorkOrderStep;
  tenantId: string;
  mode: ExecutionMode;
  actor: string;
};

export type ToolExecutionResult = {
  output: Record<string, unknown>;
  providerReference?: string | null;
  verification?: Record<string, unknown>;
  reconciliationStatus?: ExecutionEvidence["reconciliationStatus"];
};

export type EmployeeTool = {
  name: string;
  capability: string;
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>;
  verify?: (
    context: ToolExecutionContext,
    result: ToolExecutionResult
  ) => Promise<{ verified: boolean; details: Record<string, unknown> }>;
};
