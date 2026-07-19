import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/logger";
import { recordAuditCritical } from "@/lib/company/audit";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ ok: false, message: "Task id is required" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, message: "Supabase is not configured" }, { status: 500 });

    // Owner confirmation of a real-world step: the only path that closes a
    // REAL_WORLD task. Stamps the proof into metadata (which the DB trigger
    // requires) and leaves an audit trail.
    if (body.confirmReal === true) {
      const { data: current, error: readError } = await supabase.from("tasks").select("id,title,status,metadata").eq("id", id).single();
      if (readError) throw readError;
      const metadata = asRecord(current.metadata);
      const proofNote = String(body.proofNote || "").trim();
      const confirmedMetadata = {
        ...metadata,
        ownerConfirmed: true,
        ownerConfirmedAt: new Date().toISOString(),
        ...(proofNote ? { proofNote } : {}),
      };
      const { data, error } = await supabase
        .from("tasks")
        .update({ status: "DONE", progress_percent: 100, metadata: confirmedMetadata, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await recordAuditCritical({
        actor: "owner",
        action: "CONFIRM_REAL_EXECUTION",
        entityType: "task",
        entityId: id,
        detail: `أكد المالك التنفيذ الفعلي للمهمة «${current.title}»${proofNote ? ` — الإثبات: ${proofNote.slice(0, 300)}` : ""}.`,
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, task: data });
    }

    const status = String(body.status || "");
    const progress = Number(body.progressPercent ?? (status === "DONE" ? 100 : status === "IN_PROGRESS" ? 50 : 0));
    const patch: Record<string, unknown> = { status: status === "ARCHIVED" ? "DONE" : status, progress_percent: progress, updated_at: new Date().toISOString() };
    if (status === "DONE" || status === "ARCHIVED") patch.completed_at = new Date().toISOString();
    if (status === "ARCHIVED") patch.archived_at = new Date().toISOString();
    const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
    if (error) {
      // The DB proof gate rejects closing an unconfirmed real-world task.
      if (/REAL_WORLD task/.test(String(error.message))) {
        return NextResponse.json(
          { ok: false, code: "OWNER_CONFIRMATION_REQUIRED", message: "هذه مهمة تنفيذ فعلي: لا تُغلق إلا بتأكيدك المباشر مع الإثبات (زر «تأكيد التنفيذ الفعلي»)." },
          { status: 409 }
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true, task: data });
  } catch (error) {
    await logError("TASK_STATUS_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to update task" }, { status: 500 });
  }
}
