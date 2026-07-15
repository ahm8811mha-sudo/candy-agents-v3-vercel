import { NextResponse } from "next/server";
import { logAgentRun, runExecutionAgent } from "@/lib/agentRunner";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const decision = String(body.decision || "").trim();
    if (!decision) return NextResponse.json({ ok: false, message: "يرجى إرسال القرار التنفيذي." }, { status: 400 });

    const result = await runExecutionAgent(decision);
    const saved = await logAgentRun("execution_plan", { decision }, result);
    return NextResponse.json({ ok: true, result, saved });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تشغيل وكيل التنفيذ." }, { status: 500 });
  }
}
