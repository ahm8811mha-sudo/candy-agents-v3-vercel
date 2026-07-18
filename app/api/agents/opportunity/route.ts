import { NextResponse } from "next/server";
import { logAgentRun, runOpportunityAgent } from "@/lib/agentRunner";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = String(body.data || "").trim();
    if (!data) return NextResponse.json({ ok: false, message: "يرجى إرسال بيانات التحليل." }, { status: 400 });

    const result = await runOpportunityAgent(data);
    const saved = await logAgentRun("opportunity_analysis", { data }, result);
    return NextResponse.json({ ok: true, result, saved });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تشغيل وكيل الفرص." }, { status: 500 });
  }
}
