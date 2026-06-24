import { NextResponse } from "next/server";
import { logAgentRun, runMarketAnalyst } from "@/lib/agents";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const market = String(body.market || "").trim();
    const budget = Number(body.budget || 0);
    if (!market) return NextResponse.json({ ok: false, message: "يرجى إدخال السوق المستهدف." }, { status: 400 });

    const result = await runMarketAnalyst({
      market,
      budget,
      goal: String(body.goal || "تحليل السوق وتحديد الفرص."),
      timeframe: String(body.timeframe || ""),
      riskLevel: String(body.riskLevel || ""),
    });
    const saved = await logAgentRun("market_analysis", { market, budget }, result);
    return NextResponse.json({ ok: true, result, saved });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تشغيل محلل السوق." }, { status: 500 });
  }
}
