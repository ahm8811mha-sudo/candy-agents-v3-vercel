import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = String(body.data || "");
    const prompt = `Based on this market data:\n${data}\nFind top 3 business opportunities. Explain profitability, cost, risk, and speed.`;
    const result = await runAgent(prompt, { agentName: "opportunity-finder-agent" });
    const supabase = getSupabaseAdmin();
    if (supabase) await supabase.from("agent_runs").insert({ id: id("run"), agent_name: "opportunity-finder-agent", input: JSON.stringify({ data }), output: result, status: "COMPLETED" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Opportunity agent failed" }, { status: 500 });
  }
}
