import { getDashboardData, runCompanyExecution } from "./companyExecutionSystem";
import { getEnterpriseStatus, runOpportunityRadar, seedEnterpriseOperatingSystem } from "./enterpriseSystems";
import { logDecision, seedGovernanceOS } from "./governanceOS";
import { getSupabaseAdmin } from "./supabase";

type ExecutiveItemInput = {
  title: string;
  notes?: string;
  itemType?: string;
  ownerRole?: string;
  priority?: string;
  dueDays?: number;
};

type CalendarInput = {
  title: string;
  eventType?: string;
  startsAt?: string;
  durationMinutes?: number;
  notes?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
};

type MeetingMinutesInput = {
  title: string;
  attendees?: string[];
  decisions?: string;
  actionItems?: Array<Record<string, unknown>>;
  linkedEntityType?: string;
  linkedEntityId?: string;
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
  await seedGovernanceOS();
  const supabase = requireSupabase();
  const [enterprise, dashboard, calendarRows, minuteRows, briefRows, auditRows] = await Promise.all([
    getEnterpriseStatus(),
    getDashboardData(),
    supabase.from("executive_calendar_events").select("*").order("starts_at", { ascending: true }).limit(20),
    supabase.from("executive_meeting_minutes").select("*").order("created_at", { ascending: false }).limit(15),
    supabase.from("executive_daily_briefs").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("decision_audit_log").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  for (const result of [calendarRows, minuteRows, briefRows, auditRows]) {
    if (result.error) throw result.error;
  }

  const pendingItems = (enterprise.ceoItems || []).filter((item: any) => item.status !== "DONE" && item.status !== "CLOSED");
  const waitingApprovals = (dashboard.approvals || []).filter((approval: any) => approval.status === "PENDING");
  const waitingActions = (dashboard.actions || []).filter((action: any) => action.approval_status === "PENDING");
  const highRisks = (dashboard.alerts || []).filter((alert: any) => ["HIGH", "CRITICAL"].includes(alert.severity));
  const lateTasks = (dashboard.tasks || []).filter((task: any) => {
    if (!task.due_date || ["DONE", "BLOCKED"].includes(task.status)) return false;
    return new Date(task.due_date).getTime() < Date.now();
  });

  return {
    enterprise,
    dashboard,
    calendarEvents: calendarRows.data || [],
    meetingMinutes: minuteRows.data || [],
    dailyBriefs: briefRows.data || [],
    auditLog: auditRows.data || [],
    operatingBrief: {
      healthScore: enterprise.intelligence?.healthScore || 0,
      riskLevel: enterprise.intelligence?.riskLevel || "LOW",
      actionToday: enterprise.intelligence?.actionToday || "تشغيل مراجعة تنفيذية يومية.",
      pendingItems: pendingItems.length,
      waitingApprovals: waitingApprovals.length + waitingActions.length,
      highRisks: highRisks.length,
      lateTasks: lateTasks.length,
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

export async function createExecutiveCalendarEvent(input: CalendarInput) {
  if (!input.title?.trim()) throw new Error("Calendar event title is required.");
  const supabase = requireSupabase();
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date(Date.now() + 86400000);
  const durationMinutes = Number(input.durationMinutes || 30);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
  const { data, error } = await supabase
    .from("executive_calendar_events")
    .insert({
      id: newId("ceo-event"),
      title: input.title.trim(),
      event_type: input.eventType || "FOLLOW_UP",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      owner_role: "CEO Office",
      status: "SCHEDULED",
      linked_entity_type: input.linkedEntityType || null,
      linked_entity_id: input.linkedEntityId || null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createMeetingMinutes(input: MeetingMinutesInput) {
  if (!input.title?.trim()) throw new Error("Meeting title is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("executive_meeting_minutes")
    .insert({
      id: newId("minutes"),
      title: input.title.trim(),
      attendees: input.attendees || ["CEO Office", "CFO", "Marketing Director"],
      decisions: input.decisions || "No final decision recorded yet.",
      action_items: input.actionItems || [],
      linked_entity_type: input.linkedEntityType || null,
      linked_entity_id: input.linkedEntityId || null,
    })
    .select()
    .single();
  if (error) throw error;

  await logDecision({
    decisionType: "MEETING_MINUTES",
    entityType: "executive_meeting_minutes",
    entityId: data.id,
    actorRole: "Chief of Staff",
    action: `Meeting minutes recorded: ${input.title}`,
    approvalStatus: "RECORDED",
    metadata: { attendees: input.attendees, actionItems: input.actionItems },
  });

  return data;
}

export async function generateExecutiveBrief(briefType = "MORNING") {
  const supabase = requireSupabase();
  const office = await getExecutiveOffice();
  const brief = office.operatingBrief;
  const priorities = [
    { title: "Review pending approvals", count: brief.waitingApprovals },
    { title: "Clear CEO follow-ups", count: brief.pendingItems },
    { title: "Review late tasks", count: brief.lateTasks },
    { title: "Check opportunity radar and marketing pilots", count: office.enterprise.opportunityRuns?.length || 0 },
  ];
  const risks = (office.dashboard.alerts || []).slice(0, 5);
  const approvals = (office.dashboard.approvals || []).filter((item: any) => item.status === "PENDING").slice(0, 8);
  const summary =
    briefType === "END_OF_DAY"
      ? `End-of-day executive brief: ${brief.pendingItems} pending CEO items, ${brief.waitingApprovals} approvals, ${brief.highRisks} high risks, and ${brief.lateTasks} late tasks.`
      : `Morning executive brief: company health ${brief.healthScore}/100, risk ${brief.riskLevel}, ${brief.waitingApprovals} approvals waiting, and today's action is: ${brief.actionToday}`;

  const { data, error } = await supabase
    .from("executive_daily_briefs")
    .insert({
      id: newId("brief"),
      brief_type: briefType,
      summary,
      priorities,
      risks,
      approvals,
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
    await createExecutiveCalendarEvent({
      title: `CEO review: ${request.trim().slice(0, 80)}`,
      eventType: "EXECUTION_REVIEW",
      durationMinutes: 45,
      notes: result.intelligence.actionToday,
      linkedEntityType: "projects",
      linkedEntityId: result.project.id,
    });
  }

  return result;
}

export async function runExecutiveRadar() {
  const result = await runOpportunityRadar("CEO_OFFICE");
  await createExecutiveCalendarEvent({
    title: "CEO review for latest opportunity radar",
    eventType: "OPPORTUNITY_REVIEW",
    durationMinutes: 30,
    notes: result.skipped ? "Radar already ran today." : "Review radar candidate, CFO gate, and campaign draft.",
    linkedEntityType: "opportunity_radar_runs",
    linkedEntityId: result.run?.id,
  });
  return result;
}
