import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const market = String(body.market || "retail");
    const budget = Number(body.budget || 0);
    const prompt = `Analyze market: ${market}\nBudget: ${budget}\nReturn trends, demand, competition, and opportunities.`;
    const result = await runAgent(prompt, { agentName: "market-analyst-agent" });
    const supabase = getSupabaseAdmin();
    if (supabase) await supabase.from("agent_runs").insert({ id: id("run"), agent_name: "market-analyst-agent", input: JSON.stringify({ market, budget }), output: result, status: "COMPLETED" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Market agent failed" }, { status: 500 });
  }
}
