import { NextResponse } from "next/server";
import { runFullAIFlow } from "@/lib/agents";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const request = String(body.request || body.goal || "").trim();
    const market = String(body.market || "شركة عامة").trim();
    const budget = Number(body.budget || 0);
    const timeframe = String(body.timeframe || "").trim();

    if (!request) return NextResponse.json({ ok: false, message: "اكتب الطلب الذي تريد تنفيذه." }, { status: 400 });

    const result = await runFullAIFlow({ request, market, budget, timeframe });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تنفيذ الطلب." }, { status: 500 });
  }
}
