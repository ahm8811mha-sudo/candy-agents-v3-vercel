import { getDashboardData } from "./companyExecutionSystem";
import { getSupabaseAdmin } from "./supabase";

type GovernedAction = {
  title: string;
  entityType?: string;
  entityId?: string;
  amount?: number;
  riskLevel?: string;
  actorRole?: string;
  metadata?: Record<string, unknown>;
};

type AuditInput = {
  decisionType: string;
  entityType?: string;
  entityId?: string;
  actorRole?: string;
  action: string;
  amount?: number;
  riskLevel?: string;
  approvalStatus?: string;
  immutableNote?: string;
  metadata?: Record<string, unknown>;
};

const governanceRoles = [
  {
    id: "ceo",
    name: "Chief Executive Officer",
    description: "Final approval for strategic, high-risk, or large capital allocation decisions.",
    permissions: { can_approve_any: true, can_override: true, can_scale: true },
    spend_limit: 250000,
    approval_limit: 50000,
  },
  {
    id: "cfo",
    name: "Chief Financial Officer",
    description: "Controls budget, accounting integrity, cash, tax, and investment gates.",
    permissions: { can_approve_budget: true, can_close_period: true, can_block_spend: true },
    spend_limit: 50000,
    approval_limit: 5000,
  },
  {
    id: "marketing_director",
    name: "Marketing and Innovation Director",
    description: "Owns campaigns, product positioning, funnel metrics, and growth experiments.",
    permissions: { can_create_campaign: true, can_run_tests: true, can_request_budget: true },
    spend_limit: 5000,
    approval_limit: 1500,
  },
  {
    id: "chief_of_staff",
    name: "Chief of Staff",
    description: "Runs CEO office, follow-ups, meeting cadence, and execution accountability.",
    permissions: { can_schedule: true, can_follow_up: true, can_prepare_briefs: true },
    spend_limit: 2000,
    approval_limit: 0,
  },
];

const approvalPolicies = [
  {
    id: "auto_pilot",
    rule_name: "Small validated test",
    min_amount: 0,
    max_amount: 1500,
    risk_level: "LOW",
    required_role: "MARKETING_DIRECTOR",
    auto_approve: true,
  },
  {
    id: "cfo_budget_gate",
    rule_name: "CFO budget approval",
    min_amount: 1500,
    max_amount: 50000,
    risk_level: "ANY",
    required_role: "CFO",
    auto_approve: false,
  },
  {
    id: "ceo_capital_gate",
    rule_name: "CEO strategic approval",
    min_amount: 50000,
    max_amount: null,
    risk_level: "ANY",
    required_role: "CEO",
    auto_approve: false,
  },
  {
    id: "high_risk_gate",
    rule_name: "High risk override gate",
    min_amount: 0,
    max_amount: null,
    risk_level: "HIGH",
    required_role: "CEO",
    auto_approve: false,
  },
];

const costCenters = [
  { id: "cc-executive", name: "Executive Office", owner_role: "CEO Office", monthly_budget: 15000 },
  { id: "cc-marketing", name: "Growth and Marketing", owner_role: "Marketing Director", monthly_budget: 25000 },
  { id: "cc-operations", name: "Operations and Fulfillment", owner_role: "Operations Manager", monthly_budget: 20000 },
  { id: "cc-supply", name: "Supply Chain and Inventory", owner_role: "Supply Chain Manager", monthly_budget: 30000 },
  { id: "cc-radar", name: "Opportunity Radar Pilots", owner_role: "CEO Office", monthly_budget: 10000 },
];

const integrations = [
  { id: "bank-feed", provider: "Bank feed", status: "READY_FOR_CONNECTION", config: { scope: "bank_reconciliation" } },
  { id: "google-calendar", provider: "Google Calendar", status: "READY_FOR_CONNECTION", config: { scope: "executive_schedule" } },
  { id: "gmail", provider: "Gmail", status: "READY_FOR_CONNECTION", config: { scope: "secretary_follow_up" } },
  { id: "whatsapp-business", provider: "WhatsApp Business", status: "READY_FOR_CONNECTION", config: { scope: "sales_outreach" } },
  { id: "google-ads", provider: "Google Ads", status: "READY_FOR_CONNECTION", config: { scope: "demand_capture" } },
  { id: "meta-ads", provider: "Meta Ads", status: "READY_FOR_CONNECTION", config: { scope: "demand_creation" } },
];

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function seedGovernanceOS() {
  const supabase = requireSupabase();

  const { error: roleError } = await supabase.from("governance_roles").upsert(governanceRoles, { onConflict: "id" });
  if (roleError) throw roleError;

  const { error: policyError } = await supabase.from("approval_policies").upsert(approvalPolicies, { onConflict: "id" });
  if (policyError) throw policyError;

  const { error: costError } = await supabase.from("cost_centers").upsert(costCenters, { onConflict: "id" });
  if (costError) throw costError;

  const { error: integrationError } = await supabase.from("business_integrations").upsert(integrations, { onConflict: "id" });
  if (integrationError) throw integrationError;
}

export async function logDecision(input: AuditInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("decision_audit_log")
    .insert({
      decision_type: input.decisionType,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      actor_role: input.actorRole || "SYSTEM",
      action: input.action,
      amount: number(input.amount),
      risk_level: input.riskLevel || "LOW",
      approval_status: input.approvalStatus || "NOT_REQUIRED",
      immutable_note: input.immutableNote || "Recorded by Enterprise Governance OS.",
      metadata: input.metadata || {},
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function evaluateGovernedAction(action: GovernedAction) {
  await seedGovernanceOS();
  const supabase = requireSupabase();
  const amount = number(action.amount);
  const riskLevel = action.riskLevel || "LOW";
  const policies = await supabase.from("approval_policies").select("*").eq("active", true).order("min_amount", { ascending: true });
  if (policies.error) throw policies.error;

  const policy =
    (policies.data || []).find((item: any) => {
      const minOk = amount >= number(item.min_amount);
      const maxOk = item.max_amount === null || amount <= number(item.max_amount);
      const riskOk = item.risk_level === "ANY" || item.risk_level === riskLevel;
      return minOk && maxOk && riskOk;
    }) || {
      required_role: "CEO",
      auto_approve: false,
      rule_name: "Default CEO review",
    };

  const approvalStatus = policy.auto_approve ? "APPROVED" : "PENDING";
  const requiresApproval = !policy.auto_approve;
  const audit = await logDecision({
    decisionType: requiresApproval ? "APPROVAL_REQUIRED" : "AUTO_APPROVED",
    entityType: action.entityType,
    entityId: action.entityId,
    actorRole: action.actorRole || "SYSTEM",
    action: action.title,
    amount,
    riskLevel,
    approvalStatus,
    immutableNote: `Governance rule: ${policy.rule_name}. Required role: ${policy.required_role}.`,
    metadata: { ...action.metadata, policy },
  });

  let approval = null;
  if (requiresApproval && action.entityId) {
    const { data, error } = await supabase
      .from("approvals")
      .insert({
        id: newId("approval"),
        entity_type: `${policy.required_role}_GOVERNANCE_APPROVAL`,
        entity_id: action.entityId,
        status: "PENDING",
        notes: `${action.title} requires ${policy.required_role} approval by governance policy.`,
      })
      .select()
      .single();
    if (error) throw error;
    approval = data;
  }

  return {
    allowedToExecute: !requiresApproval,
    requiresApproval,
    approvalStatus,
    requiredRole: policy.required_role,
    policy,
    approval,
    audit,
  };
}

export async function getGovernanceCenter() {
  await seedGovernanceOS();
  const supabase = requireSupabase();
  const dashboard = await getDashboardData();

  const [roles, policies, audits, costCenters, integrations] = await Promise.all([
    supabase.from("governance_roles").select("*").order("approval_limit", { ascending: true }),
    supabase.from("approval_policies").select("*").order("min_amount", { ascending: true }),
    supabase.from("decision_audit_log").select("*").order("created_at", { ascending: false }).limit(40),
    supabase.from("cost_centers").select("*").order("name", { ascending: true }),
    supabase.from("business_integrations").select("*").order("provider", { ascending: true }),
  ]);

  for (const result of [roles, policies, audits, costCenters, integrations]) {
    if (result.error) throw result.error;
  }

  const pendingApprovals = (dashboard.approvals || []).filter((item: any) => item.status === "PENDING");
  const blockedActions = (dashboard.actions || []).filter((item: any) => item.approval_status === "PENDING");

  return {
    roles: roles.data || [],
    policies: policies.data || [],
    audits: audits.data || [],
    costCenters: costCenters.data || [],
    integrations: integrations.data || [],
    controlSummary: {
      pendingApprovals: pendingApprovals.length,
      blockedActions: blockedActions.length,
      auditEventsToday: (audits.data || []).filter((item: any) => String(item.created_at).startsWith(todayIso())).length,
      connectedIntegrations: (integrations.data || []).filter((item: any) => item.status === "CONNECTED").length,
      readyIntegrations: (integrations.data || []).filter((item: any) => item.status === "READY_FOR_CONNECTION").length,
    },
  };
}
