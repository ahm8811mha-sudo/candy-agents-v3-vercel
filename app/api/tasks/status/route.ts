import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    const progress = Number(body.progressPercent ?? (status === "DONE" ? 100 : status === "IN_PROGRESS" ? 50 : 0));
    if (!id) return NextResponse.json({ ok: false, message: "Task id is required" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, message: "Supabase is not configured" }, { status: 500 });
    const patch: Record<string, unknown> = { status: status === "ARCHIVED" ? "DONE" : status, progress_percent: progress, updated_at: new Date().toISOString() };
    if (status === "DONE" || status === "ARCHIVED") patch.completed_at = new Date().toISOString();
    if (status === "ARCHIVED") patch.archived_at = new Date().toISOString();
    const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, task: data });
  } catch (error) {
    await logError("TASK_STATUS_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to update task" }, { status: 500 });
  }
}
