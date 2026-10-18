import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireCompanyContext } from "@/lib/company-os/context";

const inputSchema = z.object({
  id: z.string().min(1).max(180),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED", "ARCHIVED", "WAITING_FUNDING", "ON_HOLD"]).optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  confirmReal: z.boolean().optional(), proofNote: z.string().trim().max(3000).optional(),
});
export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "EMPLOYEE");
  if (!auth.ok) return auth.response;
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.confirmReal && !parsed.data.status)) return NextResponse.json({ ok: false, message: "حالة المهمة أو نسبة التقدم غير صالحة." }, { status: 400 });
  const body = parsed.data;
  const { actor, tenantId, systemCall } = auth.context;
  if (body.confirmReal && (systemCall || !["OWNER", "ADMIN"].includes(actor.role))) return NextResponse.json({ ok: false, message: "تأكيد التنفيذ الفعلي يحتاج جلسة بشرية لصاحب الصلاحية." }, { status: 403 });
  if (body.confirmReal && (body.proofNote?.length || 0) < 10) return NextResponse.json({ ok: false, code: "OWNER_PROOF_REQUIRED", message: "دوّن إثباتاً واضحاً لا يقل عن 10 أحرف: ما نُفّذ ومرجع التحقق منه." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, message: "قاعدة البيانات غير مهيأة. لم تُعدّل المهمة." }, { status: 503 });
  const status = body.confirmReal ? "DONE" : body.status!;
  const { data, error } = await supabase.rpc("orvanta_update_task_status", {
    p_tenant_id: tenantId, p_id: body.id, p_status: status,
    p_progress: body.confirmReal ? 100 : body.progressPercent ?? (status === "DONE" ? 100 : status === "IN_PROGRESS" ? 50 : 0),
    p_actor: actor.id, p_actor_role: actor.role, p_confirm_real: Boolean(body.confirmReal), p_proof_note: body.proofNote || null,
  });
  if (error) {
    const message = /FUNDING_REQUIRED/.test(error.message) ? "يلزم اعتماد تمويل هذه الخطوة أولاً."
      : /OWNER_PROOF_REQUIRED|REAL_WORLD task/.test(error.message) ? "لا تُغلق مهمة فعلية دون تأكيد بشري وإثبات."
        : /COMPLETE_BEFORE_ARCHIVE/.test(error.message) ? "أكمل المهمة قبل أرشفتها." : "تعذر حفظ المهمة وسجل تدقيقها؛ لم يُعتمد التغيير.";
    return NextResponse.json({ ok: false, message }, { status: /TASK_NOT_FOUND/.test(error.message) ? 404 : 409 });
  }
  return NextResponse.json({ ok: true, task: data });
}
