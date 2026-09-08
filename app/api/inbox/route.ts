import { NextRequest, NextResponse } from "next/server";
import { getInbox } from "@/lib/inbox";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** GET: the unified decision inbox (all channels, pending first). */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  if (auth.context.tenantId !== getTenantId()) return NextResponse.json({ ok: false, error: "هذه الواجهة تخص شركة النشر الحالية." }, { status: 403 });
  if (!getSupabaseAdmin()) return NextResponse.json({ ok: false, error: "لا يمكن قراءة القرارات؛ قاعدة البيانات غير مهيأة." }, { status: 503 });
  try {
    const inbox = await getInbox();
    return NextResponse.json({ ok: true, ...inbox });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Inbox failed" },
      { status: 500 }
    );
  }
}
