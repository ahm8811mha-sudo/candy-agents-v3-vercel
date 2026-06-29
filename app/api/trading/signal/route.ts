import { NextRequest, NextResponse } from "next/server";
import { evaluateScalp, DEFAULT_SCALP_CONFIG } from "@/lib/trading/scalpingStrategy";
import { getMarketState } from "@/lib/trading/marketHours";
import { DEFAULT_SESSION_LIMITS } from "@/lib/trading/sessionGuard";
import { isAlpacaConfigured, alpacaMode } from "@/lib/trading/brokers/alpaca";
import type { Candle } from "@/lib/trading/indicators";

export const dynamic = "force-dynamic";

/** Deterministic-ish sample candle series for the live demo / preview. */
function sampleCandles(seedPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = seedPrice;
  for (let i = 0; i < 40; i++) {
    // Gentle mean-reverting wave so the demo stays in low-volatility territory.
    const drift = Math.sin(i / 3) * 0.15;
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) + 0.1;
    const low = Math.min(open, close) - 0.1;
    candles.push({ open, high, low, close });
    price = close;
  }
  return candles;
}

export async function GET() {
  const candles = sampleCandles();
  const result = evaluateScalp(candles);
  const market = getMarketState();

  return NextResponse.json({
    ok: true,
    demo: true,
    signal: result,
    market,
    config: DEFAULT_SCALP_CONFIG,
    sessionLimits: DEFAULT_SESSION_LIMITS,
    broker: { alpacaConfigured: isAlpacaConfigured(), mode: alpacaMode() },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const candles: Candle[] = Array.isArray(body.candles) ? body.candles : [];
    if (candles.length < 30) {
      return NextResponse.json(
        { ok: false, error: "يلزم 30 شمعة على الأقل لحساب المؤشرات بدقة." },
        { status: 400 }
      );
    }
    const config = { ...DEFAULT_SCALP_CONFIG, ...(body.config || {}) };
    const result = evaluateScalp(candles, config);
    return NextResponse.json({ ok: true, signal: result, market: getMarketState() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Signal evaluation failed" },
      { status: 500 }
    );
  }
}
