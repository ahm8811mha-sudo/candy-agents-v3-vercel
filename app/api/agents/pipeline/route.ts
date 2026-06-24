import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const market = String(body.market || "retail");
    const budget = Number(body.budget || 0);
    const goal = String(body.goal || "find opportunity");
    const marketResult = await runAgent(`Analyze ${market} with budget ${budget}`, { agentName: "market" });
    const opportunityResult = await runAgent(`Use this: ${marketResult}. Find opportunities.`, { agentName: "opportunity" });
    const decisionResult = await runAgent(`Budget ${budget}. Choose from: ${opportunityResult}`, { agentName: "decision" });
    const executionResult = await runAgent(`Make execution plan for: ${decisionResult}`, { agentName: "execution" });
    const final = `${marketResult}\n\n${opportunityResult}\n\n${decisionResult}\n\n${executionResult}`;
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("agent_runs").insert({ id: id("run"), agent_name: "pipeline", input: JSON.stringify({ market, budget, goal }), output: final, status: "COMPLETED" });
      await supabase.from("inbox_items").insert({ id: id("inbox"), request_text: goal, result_title: "Pipeline Result", result_content: final, assigned_agent: "pipeline", department_id: "exec", status: "DELIVERED" });
    }
    return NextResponse.json({ ok: true, marketResult, opportunityResult, decisionResult, executionResult });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
