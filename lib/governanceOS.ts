/**
 * Enterprise governance facade.
 *
 * Historically this module was a PARALLEL decision center: its own role list,
 * its own `approval_policies` thresholds (auto-approve ≤ 1,500 SAR), its own
 * `decision_audit_log` table, and pending items written to the legacy
 * `approvals` table — none of which the unified decision center could see.
 *
 * It is now a facade over the single authoritative stack:
 *   - authority matrix: lib/company/governance.ts (T0–T3)
 *   - pending sign-offs: lib/approvals.ts → company_approvals (the /inbox queue)
 *   - audit trail:       lib/company/audit.ts → audit_log
 *
 * The exported names and return shapes are preserved so the enterprise
 * modules (proAccounting, enterpriseSystems, marketingOS, executiveOffice,
 * governmentRelations) keep working unchanged — but every gated action now
 * follows the same rulebook and lands in the same owner inbox as the rest of
 * the company.
 */

import { getDashboardData } from "./companyExecutionSystem";
import { getSupabaseAdmin } from "./supabase";
import { requiredTier, AUTHORITY_MATRIX, type TierRule } from "./company/governance";
import { COMPANY_AGENTS } from "./company/agents";
import { createApprovalCritical, listApprovals, hydrateApprovals, type ApprovalItem } from "./approvals";
import { recordAudit, listAudit, hydrateAudit, type AuditEntry } from "./company/audit";

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Governance policy view synthesized from the single authority matrix. */
function policyFromTier(rule: TierRule) {
  return {
    id: `tier-${rule.tier.toLowerCase()}`,
    rule_name: rule.label,
    min_amount: 0,
    max_amount: Number.isFinite(rule.maxSAR) ? rule.maxSAR : null,
    risk_level: "ANY",
    required_role: rule.approver,
    auto_approve: rule.tier === "T0",
    tier: rule.tier,
  };
}

/** Seed non-governance reference data (cost centers, integration catalog). */
export async function seedGovernanceOS() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error: costError } = await supabase.from("cost_centers").upsert(costCenters, { onConflict: "id" });
  if (costError) throw costError;

  const { error: integrationError } = await supabase.from("business_integrations").upsert(integrations, { onConflict: "id" });
  if (integrationError) throw integrationError;
}

/** Records into the unified append-only audit trail (audit_log). */
export async function logDecision(input: AuditInput): Promise<AuditEntry> {
  return recordAudit({
    actor: input.actorRole || "SYSTEM",
    action: `${input.decisionType}: ${input.action}`,
    entityType: input.entityType || "governance",
    entityId: input.entityId || "-",
    detail:
      `${input.immutableNote || "Enterprise governed action."}` +
      (input.amount ? ` · المبلغ ${number(input.amount).toLocaleString("ar-SA")} ر.س` : "") +
      (input.riskLevel ? ` · المخاطرة ${input.riskLevel}` : "") +
      (input.approvalStatus ? ` · الحالة ${input.approvalStatus}` : ""),
  });
}

/**
 * Gate an enterprise action through the SAME authority matrix and decision
 * center as everything else. HIGH risk always escalates to the owner inbox,
 * regardless of amount; otherwise T0 executes immediately and T1+ waits for
 * sign-off in company_approvals.
 */
export async function evaluateGovernedAction(action: GovernedAction) {
  const amount = number(action.amount);
  const riskLevel = String(action.riskLevel || "LOW").toUpperCase();
  const tier = requiredTier(amount);
  const highRisk = riskLevel === "HIGH";
  const requiresApproval = highRisk || tier.tier !== "T0";
  const approvalStatus = requiresApproval ? "PENDING" : "APPROVED";
  const policy = {
    ...policyFromTier(tier),
    ...(highRisk ? { rule_name: `${tier.label} · تصعيد مخاطرة عالية`, auto_approve: false } : {}),
  };

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
  });

  let approval: ApprovalItem | null = null;
  if (requiresApproval) {
    approval = await createApprovalCritical({
      type: "GENERAL",
      title: action.title,
      detail:
        `إجراء مؤسسي بانتظار الاعتماد · الفئة ${tier.tier} — يعتمدها ${tier.approver}` +
        (highRisk ? " · مخاطرة عالية (تصعيد إلزامي)" : "") +
        (action.entityType ? ` · النوع ${action.entityType}` : ""),
      amount: amount > 0 ? amount : undefined,
      requestedRole: action.actorRole || "SYSTEM",
      dedupeKey: action.entityId ? `gov-${action.entityType || "action"}-${action.entityId}` : undefined,
      metadata: {
        ...action.metadata,
        source: "governanceOS",
        entityType: action.entityType ?? null,
        entityId: action.entityId ?? null,
        riskLevel,
        tier: tier.tier,
      },
    });
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
  await Promise.all([hydrateApprovals(), hydrateAudit()]);
  await seedGovernanceOS();
  const supabase = getSupabaseAdmin();
  const dashboard = await getDashboardData();

  const [costCenterRows, integrationRows] = supabase
    ? await Promise.all([
        supabase.from("cost_centers").select("*").order("name", { ascending: true }),
        supabase.from("business_integrations").select("*").order("provider", { ascending: true }),
      ])
    : [null, null];
  if (costCenterRows?.error) throw costCenterRows.error;
  if (integrationRows?.error) throw integrationRows.error;

  const audits = listAudit({}, 40);
  const pendingUnified = listApprovals("PENDING");
  const pendingApprovals = (dashboard.approvals || []).filter((item: any) => item.status === "PENDING");
  const blockedActions = (dashboard.actions || []).filter((item: any) => item.approval_status === "PENDING");
  const integrationData = integrationRows?.data || integrations;

  return {
    roles: COMPANY_AGENTS.filter((agent) => agent.rank === "OWNER" || agent.rank === "CEO" || agent.rank === "DEPARTMENT_HEAD").map(
      (agent) => ({
        id: agent.id,
        name: `${agent.name} — ${agent.title}`,
        description: agent.responsibilities.join("، "),
        permissions: { rank: agent.rank, department: agent.department },
        spend_limit: agent.authorityLimitSAR,
        approval_limit: agent.authorityLimitSAR,
      })
    ),
    policies: AUTHORITY_MATRIX.map(policyFromTier),
    audits,
    costCenters: costCenterRows?.data || costCenters,
    integrations: integrationData,
    controlSummary: {
      pendingApprovals: pendingUnified.length + pendingApprovals.length,
      blockedActions: blockedActions.length,
      auditEventsToday: audits.filter((item) => String(item.createdAt).startsWith(todayIso())).length,
      connectedIntegrations: integrationData.filter((item: any) => item.status === "CONNECTED").length,
      readyIntegrations: integrationData.filter((item: any) => item.status === "READY_FOR_CONNECTION").length,
    },
  };
}
