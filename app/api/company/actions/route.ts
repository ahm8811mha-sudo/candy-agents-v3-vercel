import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { enforceCompanyPolicy } from "@/lib/company-os/policy";
import { getReconciliationForAction } from "@/lib/company-os/reconciliation";
import { listCompanyActions, updateCompanyActionStatus, type CompanyActionStatus } from "@/lib/company/actionQueue";
import { hydrateCompany } from "@/lib/company/hydrate";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function operatingIdentityMigrationMissing(error: { code?: string; message?: string } | null) {
  const message = String(error?.message || "");
  return error?.code === "42703"
    || error?.code === "PGRST204"
    || /project_number|project_date|task_number|task_date|owner_guidance/i.test(message);
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    await hydrateCompany();
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const recentActions = await listCompanyActions(
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
      auth.context.tenantId
    );
    const supabase = getSupabaseAdmin();
    let projects: unknown[] = [];
    let tasks: unknown[] = [];
    let actions = recentActions;

    if (supabase) {
      const numberedProjectsResult = await supabase
        .from("projects")
        .select("id,project_number,project_date,name,request,status,budget,approved_budget,health_score,risk_level,approval_status,strategic_direction,owner_guidance,financial_snapshot,created_at")
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: false })
        .limit(50);
      const projectsResult = operatingIdentityMigrationMissing(numberedProjectsResult.error)
        ? await supabase
            .from("projects")
            .select("id,name,request,status,budget,approved_budget,health_score,risk_level,approval_status,strategic_direction,financial_snapshot,created_at")
            .eq("tenant_id", auth.context.tenantId)
            .order("created_at", { ascending: false })
            .limit(50)
        : numberedProjectsResult;
      if (projectsResult.error) throw projectsResult.error;
      projects = projectsResult.data || [];
      const projectIds = (projectsResult.data || []).map((project) => String(project.id));

      if (projectIds.length > 0) {
        const [numberedTasksResult, linkedActionsResult] = await Promise.all([
          supabase
            .from("tasks")
            .select("id,project_id,task_sequence,task_number,task_date,title,description,status,priority,progress_percent,owner_role,due_date,metadata,created_at")
            .eq("tenant_id", auth.context.tenantId)
            .in("project_id", projectIds)
            .order("created_at", { ascending: true }),
          supabase
            .from("business_actions")
            .select("*")
            .eq("tenant_id", auth.context.tenantId)
            .in("project_id", projectIds)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        const tasksResult = operatingIdentityMigrationMissing(numberedTasksResult.error)
          ? await supabase
              .from("tasks")
              .select("id,project_id,title,description,status,priority,progress_percent,owner_role,due_date,metadata,created_at")
              .eq("tenant_id", auth.context.tenantId)
              .in("project_id", projectIds)
              .order("created_at", { ascending: true })
          : numberedTasksResult;
        if (tasksResult.error) throw tasksResult.error;
        if (linkedActionsResult.error) throw linkedActionsResult.error;
        tasks = tasksResult.data || [];
        const byId = new Map(recentActions.map((action) => [action.id, action]));
        for (const action of linkedActionsResult.data || []) byId.set(String(action.id), action);
        actions = [...byId.values()];
      }
    }

    return NextResponse.json({ ok: true, actions, projects, tasks, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list company actions", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const status = String(body.status || "") as CompanyActionStatus;
    const allowed: CompanyActionStatus[] = [
      "QUEUED",
      "WAITING_APPROVAL",
      "WAITING_INTEGRATION",
      "RUNNING",
      "WAITING_RECONCILIATION",
      "DONE",
      "FAILED",
      "CANCELLED",
    ];

    if (!id || !allowed.includes(status)) {
      return NextResponse.json({ ok: false, error: "يلزم id وحالة صحيحة للإجراء.", requestId: auth.context.requestId }, { status: 400 });
    }

    if (status === "DONE" && process.env.ORVANTA_RECONCILIATION_REQUIRED === "true") {
      const reconciliation = await getReconciliationForAction(auth.context.tenantId, id);
      if (!reconciliation || reconciliation.status !== "RECONCILED") {
        return NextResponse.json(
          {
            ok: false,
            code: "RECONCILIATION_REQUIRED",
            error: "لا يمكن اعتبار الإجراء مكتملاً قبل وجود إيصال خارجي وتسوية ناجحة.",
            requestId: auth.context.requestId,
          },
          { status: 409 }
        );
      }
    }

    const policy = await enforceCompanyPolicy(
      {
        tenantId: auth.context.tenantId,
        actor: auth.context.actor,
        operation: status === "DONE" ? "RECONCILE_ACTION" : "ADMINISTER_POLICY",
        evidenceCount: body.result ? 1 : 0,
        commitmentSAR: Number(body.amountSAR || 0),
        approvedRoles: auth.context.actor.role === "CFO" ? ["CFO"] : auth.context.actor.role === "CEO" ? ["CEO"] : [],
      },
      { type: "business_action", id }
    );

    const action = await updateCompanyActionStatus({
      id,
      tenantId: auth.context.tenantId,
      status,
      actor: auth.context.actor.name,
      result: body.result && typeof body.result === "object" ? body.result : undefined,
      error: body.error ? String(body.error) : undefined,
      note: body.note ? String(body.note) : undefined,
    });

    return NextResponse.json({ ok: true, action, policy, requestId: auth.context.requestId });
  } catch (error) {
    const typed = error as Error & { code?: string; decision?: unknown };
    const conflict = typed.code === "OWNER_ABSENCE_ESCALATION"
      || typed.code === "COMPLETION_EVIDENCE_REQUIRED";
    return NextResponse.json(
      { ok: false, code: typed.code, policy: typed.decision, error: typed.message || "Failed to update company action", requestId: auth.context.requestId },
      { status: typed.code === "POLICY_DENIED" ? 403 : conflict ? 409 : 500 }
    );
  }
}
