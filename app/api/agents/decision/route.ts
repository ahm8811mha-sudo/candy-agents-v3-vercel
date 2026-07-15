import { NextResponse } from "next/server";
import { logAgentRun, runDecisionAgent } from "@/lib/agentRunner";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const opportunities = String(body.opportunities || "").trim();
    const budget = Number(body.budget || 0);
    if (!opportunities) return NextResponse.json({ ok: false, message: "يرجى إرسال الفرص المقترحة." }, { status: 400 });

    const result = await runDecisionAgent(opportunities, budget);
    const saved = await logAgentRun("decision_analysis", { opportunities, budget }, result);
    return NextResponse.json({ ok: true, result, saved });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تشغيل وكيل القرار." }, { status: 500 });
  }
}
