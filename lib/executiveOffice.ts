import { getDashboardData, runCompanyExecution } from "./companyExecutionSystem";
import { getEnterpriseStatus, runOpportunityRadar, seedEnterpriseOperatingSystem } from "./enterpriseSystems";
import { getSupabaseAdmin } from "./supabase";

type ExecutiveItemInput = {
  title: string;
  notes?: string;
  itemType?: string;
  ownerRole?: string;
  priority?: string;
  dueDays?: number;
};

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getExecutiveOffice() {
  await seedEnterpriseOperatingSystem();
  const [enterprise, dashboard] = await Promise.all([getEnterpriseStatus(), getDashboardData()]);

  const pendingItems = (enterprise.ceoItems || []).filter((item: any) => item.status !== "DONE" && item.status !== "CLOSED");
  const waitingApprovals = (dashboard.approvals || []).filter((approval: any) => approval.status === "PENDING");
  const waitingActions = (dashboard.actions || []).filter((action: any) => action.approval_status === "PENDING");
  const highRisks = (dashboard.alerts || []).filter((alert: any) => ["HIGH", "CRITICAL"].includes(alert.severity));

  return {
    enterprise,
    dashboard,
    operatingBrief: {
      healthScore: enterprise.intelligence?.healthScore || 0,
      riskLevel: enterprise.intelligence?.riskLevel || "LOW",
      actionToday: enterprise.intelligence?.actionToday || "تشغيل مراجعة تنفيذية يومية.",
      pendingItems: pendingItems.length,
      waitingApprovals: waitingApprovals.length + waitingActions.length,
      highRisks: highRisks.length,
      activeProjects: (dashboard.projects || []).filter((project: any) => project.status !== "DONE" && project.status !== "CLOSED").length,
    },
  };
}

export async function createExecutiveItem(input: ExecutiveItemInput) {
  if (!input.title?.trim()) throw new Error("Executive item title is required.");
  const supabase = requireSupabase();
  const dueDays = Number(input.dueDays || 1);
  const { data, error } = await supabase
    .from("ceo_office_items")
    .insert({
      id: newId("ceo-item"),
      item_type: input.itemType || "CEO_DIRECTIVE",
      title: input.title.trim(),
      owner_role: input.ownerRole || "CEO Office",
      status: "PENDING",
      priority: input.priority || "HIGH",
      due_at: new Date(Date.now() + Math.max(dueDays, 1) * 86400000).toISOString(),
      notes: input.notes?.trim() || null,
      metadata: { source: "executive_office_console" },
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateExecutiveItem(id: string, status: string) {
  if (!id) throw new Error("Executive item id is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("ceo_office_items")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function runExecutiveRequest(request: string) {
  if (!request?.trim()) throw new Error("Executive request is required.");
  const result = await runCompanyExecution(request.trim());
  const supabase = getSupabaseAdmin();

  if (supabase) {
    await supabase.from("ceo_office_items").insert({
      id: newId("ceo-item"),
      item_type: "EXECUTION_REVIEW",
      title: `متابعة تنفيذ: ${request.trim().slice(0, 80)}`,
      owner_role: "CEO Office",
      status: result.approval ? "PENDING_APPROVAL" : "ACTIVE",
      priority: result.intelligence.riskLevel === "HIGH" ? "URGENT" : "HIGH",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      notes: result.intelligence.actionToday,
      metadata: { project_id: result.project.id, approval: result.intelligence.approval },
    });
  }

  return result;
}

export async function runExecutiveRadar() {
  const result = await runOpportunityRadar("CEO_OFFICE");
  return result;
}
