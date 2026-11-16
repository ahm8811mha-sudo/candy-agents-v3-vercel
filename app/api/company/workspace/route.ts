import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readIdeasCritical } from "@/lib/company/ideas";
import { approvalVisibleToChairman, collapseDuplicates, returnedToDepartment } from "@/lib/company/spendChain";
import { ideaItem, projectItem, spendItem, taskItem } from "@/lib/company/counterItems";

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
      db.from("company_approvals").select("id,title,amount,requested_role,created_at,type,status,metadata").eq("tenant_id", tenantId).eq("status", "PENDING").order("created_at").limit(1000),
      db.from("projects").select("id,name,status,project_number,budget,created_at", { count: "exact" }).eq("tenant_id", tenantId).eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(100),
      db.from("tasks").select("*", { count: "exact" }).eq("tenant_id", tenantId).in("status", ["BLOCKED", "WAITING_FUNDING", "ON_HOLD"]).is("archived_at", null).order("created_at").limit(100),
      db.from("tasks").select("*", { count: "exact" }).eq("tenant_id", tenantId).eq("metadata->>executionKind", "REAL_WORLD").eq("status", "REVIEW").is("archived_at", null).order("updated_at", { ascending: false }).limit(100),
    ]);
    for (const result of [approvals, projects, blocked, proof]) if (result.error) throw result.error;
    // Only requests that finished the full review chain without a stop await the Chairman.
    const rows = (approvals.data || []) as Array<{ id: string; title: string; amount: number | null; status: string; metadata: Record<string, unknown> | null }>;
    const ready = collapseDuplicates(rows.filter((row) => approvalVisibleToChairman(row)));
    const returned = collapseDuplicates(rows.filter((row) => returnedToDepartment(row)));
    const blockedRows = (blocked.data || []) as Array<Record<string, unknown>>;
    const projectRows = (projects.data || []) as Array<{ id: string; name: string; status?: string; budget?: number | null; created_at?: string; project_number?: number | null }>;
    // Every counter ships with the records it counts (capped at 100; the count stays exact).
    const items = {
      decisions: ready.map((row) => spendItem(row)),
      returned: returned.map((row) => spendItem(row)),
      blocked: blockedRows.map((row) => taskItem(row)),
      projects: projectRows.map((row) => projectItem(row)),
      proof: ((proof.data || []) as Array<Record<string, unknown>>).map((row) => taskItem(row)),
      study: ideas.filter((i) => i.status === "UNDER_STUDY").map(ideaItem),
      decision: ideas.filter((i) => i.status === "PENDING_APPROVAL").map(ideaItem),
      approved: ideas.filter((i) => i.status === "APPROVED" && !i.executedProjectId).map(ideaItem),
      execution: ideas.filter((i) => i.executedProjectId).map(ideaItem),
    };
    return NextResponse.json({ ok: true, asOf: new Date().toISOString(), items,
      counts: { decisions: ready.length, returned: returned.length, projects: projects.count || 0, blocked: blocked.count || 0, proof: proof.count || 0 },
      stages: { study: ideas.filter((i) => i.status === "UNDER_STUDY").length, decision: ideas.filter((i) => i.status === "PENDING_APPROVAL").length, approved: ideas.filter((i) => i.status === "APPROVED" && !i.executedProjectId).length, execution: ideas.filter((i) => i.executedProjectId).length },
      approvals: ready.slice(0, 5), returned: returned.slice(0, 5).map((row) => ({ ...row, stop: returnedToDepartment(row) })), projects: projectRows.slice(0, 4), blockers: blockedRows.slice(0, 5).map((row) => ({ id: row.id, title: row.title, status: row.status, project_id: row.project_id ?? null })),
    });
  } catch { return NextResponse.json({ ok: false, error: "تعذر قراءة حالة العمل كاملة. حدّث البيانات للمحاولة مجدداً." }, { status: 503 }); }
}
