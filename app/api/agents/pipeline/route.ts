import { NextResponse } from "next/server";
import { runFullAIFlow } from "@/lib/agents";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const market = String(body.market || "").trim();
    const goal = String(body.goal || "").trim();
    const budget = Number(body.budget || 0);

    if (!market) return NextResponse.json({ ok: false, message: "يرجى إدخال السوق المستهدف." }, { status: 400 });
    if (!goal) return NextResponse.json({ ok: false, message: "يرجى إدخال الهدف التجاري." }, { status: 400 });
    if (!Number.isFinite(budget) || budget <= 0) return NextResponse.json({ ok: false, message: "يرجى إدخال ميزانية صحيحة." }, { status: 400 });

    const result = await runFullAIFlow({
      market,
      budget,
      goal,
      timeframe: String(body.timeframe || ""),
      riskLevel: String(body.riskLevel || ""),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تشغيل سلسلة الوكلاء." }, { status: 500 });
  }
}
