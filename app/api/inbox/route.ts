import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, items: [] });
  const { data, error } = await supabase.from("inbox_items").select("*").order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  const items = data.map((x: any) => ({ id: x.id, requestText: x.request_text, resultTitle: x.result_title, resultContent: x.result_content, assignedAgent: x.assigned_agent, departmentId: x.department_id, taskId: x.task_id, status: x.status, createdAt: x.created_at }));
  return NextResponse.json({ ok: true, items });
}
