import { NextRequest, NextResponse } from "next/server";
import { runCfoTradingCycle, sampleOpportunities, type RunCycleInput } from "@/lib/trading/cfoTrader";
import { defaultRiskLimits } from "@/lib/trading/riskEngine";
import { isLiveTradingEnabled } from "@/lib/trading/executionEngine";
import type { MarketOpportunity, TradingMode } from "@/lib/trading/types";

export const dynamic = "force-dynamic";

const DEFAULT_BUDGET = 100_000;

/** GET: desk status, default limits, and the current opportunity feed. */
export async function GET() {
  const budget = DEFAULT_BUDGET;
  return NextResponse.json({
    ok: true,
    liveEnabled: isLiveTradingEnabled(),
    budget,
    limits: defaultRiskLimits(budget),
    opportunities: sampleOpportunities(),
  });
}

/** POST: run a CFO trading cycle (simulation by default). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const budget = Number(body.budget) > 0 ? Number(body.budget) : DEFAULT_BUDGET;
    const requestedMode: TradingMode = body.mode === "LIVE" ? "LIVE" : "SIMULATION";
    const opportunities: MarketOpportunity[] = Array.isArray(body.opportunities) && body.opportunities.length
      ? body.opportunities
      : sampleOpportunities();

    const input: RunCycleInput = { budget, opportunities, requestedMode };
    const result = runCfoTradingCycle(input);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Trading cycle failed" },
      { status: 500 }
    );
  }
}
