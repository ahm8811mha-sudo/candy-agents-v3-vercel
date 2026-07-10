export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ExecutiveRole = "OWNER" | "CEO" | "CFO" | "COO" | "CRO" | "CGO";

export type BusinessEngineId =
  | "OPPORTUNITY"
  | "STRATEGY"
  | "FINANCE"
  | "OPERATIONS"
  | "GOVERNANCE"
  | "GROWTH"
  | "CUSTOMER"
  | "SUPPLY_CHAIN";

export type LifecycleStageId =
  | "OPPORTUNITY_DISCOVERY"
  | "VALIDATION"
  | "FINANCIAL_ANALYSIS"
  | "RISK_ASSESSMENT"
  | "APPROVAL"
  | "PROJECT_CREATION"
  | "EXECUTION"
  | "PERFORMANCE_MONITORING"
  | "OPTIMIZATION"
  | "SCALE_HOLD_KILL";

export type LifecycleStage = {
  id: LifecycleStageId;
  order: number;
  name: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  responsibleEngines: BusinessEngineId[];
  humanInvolvement: string;
  approvalRule: string;
  successMetrics: string[];
};

export type GovernancePolicy = {
  level: RiskLevel;
  description: string;
  examples: string[];
  approvers: ExecutiveRole[];
  controls: string[];
  requiredDocumentation: string[];
  maximumAutomaticCommitmentSAR: number;
};

export type ExecutiveDefinition = {
  role: ExecutiveRole;
  name: string;
  mission: string;
  authority: string[];
  responsibilities: string[];
  kpis: string[];
  escalationRules: string[];
};

export type BusinessEngineDefinition = {
  id: BusinessEngineId;
  name: string;
  mission: string;
  owns: string[];
  collaboratesWith: BusinessEngineId[];
  decisionRights: string[];
  metrics: string[];
};

export type WorkflowEngineDefinition = {
  id: string;
  name: string;
  trigger: string;
  outcome: string;
  ownerEngine: BusinessEngineId;
  materialRisk: RiskLevel;
};

export type ExecutionWorkerDefinition = {
  id: string;
  name: string;
  capabilities: string[];
  restrictions: string[];
};

export type DecisionPacket = {
  id: string;
  tenantId: string;
  title: string;
  objectiveId?: string;
  opportunityId?: string;
  projectId?: string;
  recommendation: string;
  facts: string[];
  assumptions: string[];
  options: Array<{ label: string; benefits: string[]; risks: string[] }>;
  financialImpactSAR: number;
  riskLevel: RiskLevel;
  dissentingView?: string;
  requiredApprovals: ExecutiveRole[];
  successCriteria: string[];
  killCriteria: string[];
  reviewAt: string;
  createdAt: string;
};

export type CompanyEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  type: string;
  version: number;
  tenantId: string;
  actorId: string;
  actorType: "HUMAN" | "AI_ENGINE" | "WORKER" | "SYSTEM";
  entityType: string;
  entityId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  payload: TPayload;
};

export type KnowledgeEntityType =
  | "COMPANY"
  | "OBJECTIVE"
  | "OPPORTUNITY"
  | "DECISION"
  | "CUSTOMER"
  | "SUPPLIER"
  | "PRODUCT"
  | "PROJECT"
  | "WORKFLOW"
  | "RISK"
  | "CONTRACT"
  | "TRANSACTION"
  | "AGENT"
  | "OUTCOME";

export type KnowledgeNode = {
  id: string;
  tenantId: string;
  type: KnowledgeEntityType;
  name: string;
  summary?: string;
  validFrom: string;
  validTo?: string;
  source: string;
  metadata: Record<string, unknown>;
};

export type KnowledgeEdge = {
  id: string;
  tenantId: string;
  fromNodeId: string;
  toNodeId: string;
  relationship: string;
  validFrom: string;
  validTo?: string;
  metadata: Record<string, unknown>;
};

export type PerformanceTarget = {
  id: string;
  label: string;
  target: string;
  percentile?: string;
  notes?: string;
};

export type TransformationPhase = {
  id: number;
  name: string;
  horizon: string;
  objectives: string[];
  features: string[];
  infrastructure: string[];
  successMetrics: string[];
};
