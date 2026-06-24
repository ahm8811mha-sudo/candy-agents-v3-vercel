import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const decision = String(body.decision || "");
    const prompt = `Decision:\n${decision}\nBreak into tasks, roles, timeline, and checkpoints.`;
    const result = await runAgent(prompt, { agentName: "execution-agent" });
    const supabase = getSupabaseAdmin();
    if (supabase) await supabase.from("agent_runs").insert({ id: id("run"), agent_name: "execution-agent", input: JSON.stringify({ decision }), output: result, status: "COMPLETED" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
