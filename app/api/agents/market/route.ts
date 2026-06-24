import { NextResponse } from "next/server";
import { logAgentRun, runMarketAnalyst } from "@/lib/agents";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const market = String(body.market || "").trim();
    const request = String(body.request || body.goal || "حلل الوضع الحالي وحدد أفضل إجراء.").trim();
    const budget = Number(body.budget || 0);

    if (!market) return NextResponse.json({ ok: false, message: "يرجى إدخال مجال الشركة." }, { status: 400 });

    const result = await runMarketAnalyst({
      market,
      budget,
      request,
      timeframe: String(body.timeframe || ""),
    });
    const saved = await logAgentRun("market_analysis", { market, budget, request }, result);
    return NextResponse.json({ ok: true, result, saved });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تشغيل موظف التحليل." }, { status: 500 });
  }
}
