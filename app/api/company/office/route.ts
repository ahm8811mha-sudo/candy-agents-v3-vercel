import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildOfficeFloor, type OfficeTaskRow } from "@/lib/company/officeFloor";
import { hydrateCompany } from "@/lib/company/hydrate";
import { hydrateChairmanCommands } from "@/lib/company/chairmanCommands";

export const dynamic = "force-dynamic";

/** GET: read-only live office floor — every employee, their real work, and the spend chain in flight. */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  try {
    await Promise.all([hydrateCompany(), hydrateChairmanCommands()]);
    let tasks: OfficeTaskRow[] = [];
    let tasksAvailable = false;
    const db = getSupabaseAdmin();
    if (db) {
      const { data, error } = await db.from("tasks").select("*").eq("tenant_id", auth.context.tenantId).is("archived_at", null).order("updated_at", { ascending: false }).limit(500);
      if (!error && data) { tasks = data as OfficeTaskRow[]; tasksAvailable = true; }
    }
    return NextResponse.json({ ok: true, ...buildOfficeFloor({ tasks, tasksAvailable }) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "تعذر قراءة حالة المكتب. حدّث البيانات للمحاولة مجدداً." }, { status: 503 });
  }
}
