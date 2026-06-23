import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    const approverId = String(body.approverId || "");
    if (!id || !["APPROVED", "REJECTED"].includes(status)) return NextResponse.json({ ok: false, message: "Invalid approval decision" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, message: "Supabase is not configured" }, { status: 500 });
    const { data: approval } = await supabase.from("approvals").select("requested_by, approver_id").eq("id", id).single();
    if (approval?.requested_by === approverId) return NextResponse.json({ ok: false, message: "لا يمكن للمستخدم الموافقة على طلبه الخاص" }, { status: 403 });
    const { data, error } = await supabase.from("approvals").update({ status, decided_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, approval: data });
  } catch (error) {
    await logError("APPROVAL_DECISION_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to decide approval" }, { status: 500 });
  }
}
