import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const budget = Number(body.budget || 0);
    const opportunities = String(body.opportunities || "");
    const prompt = `Budget: ${budget}\nOptions:\n${opportunities}\nSelect one option and give reasons, risks, and next step.`;
    const result = await runAgent(prompt, { agentName: "decision-agent" });
    const supabase = getSupabaseAdmin();
    if (supabase) await supabase.from("agent_runs").insert({ id: id("run"), agent_name: "decision-agent", input: JSON.stringify({ budget, opportunities }), output: result, status: "COMPLETED" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
