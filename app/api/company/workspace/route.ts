import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readIdeasCritical } from "@/lib/company/ideas";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "قاعدة البيانات غير مهيأة على هذه النسخة. لا يمكن تأكيد حالة العمل." }, { status: 503 });
  const tenantId = auth.context.tenantId;
  try {
    const [ideas, approvals, projects, blocked, proof] = await Promise.all([
      readIdeasCritical(tenantId),
      db.from("company_approvals").select("id,title,amount,requested_role,created_at,type,metadata", { count: "exact" }).eq("tenant_id", tenantId).eq("status", "PENDING").order("created_at").limit(5),
      db.from("projects").select("id,name,status,project_number,budget,created_at", { count: "exact" }).eq("tenant_id", tenantId).eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(4),
      db.from("tasks").select("id,title,status,project_id", { count: "exact" }).eq("tenant_id", tenantId).in("status", ["BLOCKED", "WAITING_FUNDING", "ON_HOLD"]).is("archived_at", null).order("created_at").limit(5),
      db.from("tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("metadata->>executionKind", "REAL_WORLD").eq("status", "REVIEW").is("archived_at", null),
    ]);
    for (const result of [approvals, projects, blocked, proof]) if (result.error) throw result.error;
    return NextResponse.json({ ok: true, asOf: new Date().toISOString(),
      counts: { decisions: approvals.count || 0, projects: projects.count || 0, blocked: blocked.count || 0, proof: proof.count || 0 },
      stages: { study: ideas.filter((i) => i.status === "UNDER_STUDY").length, decision: ideas.filter((i) => i.status === "PENDING_APPROVAL").length, approved: ideas.filter((i) => i.status === "APPROVED" && !i.executedProjectId).length, execution: ideas.filter((i) => i.executedProjectId).length },
      approvals: approvals.data, projects: projects.data, blockers: blocked.data,
    });
  } catch { return NextResponse.json({ ok: false, error: "تعذر قراءة حالة العمل كاملة. حدّث البيانات للمحاولة مجدداً." }, { status: 503 }); }
}
