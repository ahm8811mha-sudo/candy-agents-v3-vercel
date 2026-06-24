import { runFinanceDecisionSystem } from "@/lib/aiFinanceDecision";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { request } = await req.json();
    const result = await runFinanceDecisionSystem(request);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Finance decision system failed",
      },
      { status: 500 }
    );
  }
}
