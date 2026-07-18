import { NextRequest, NextResponse } from "next/server";
import { evaluateScalp, DEFAULT_SCALP_CONFIG } from "@/lib/trading/scalpingStrategy";
import { getMarketState } from "@/lib/trading/marketHours";
import { DEFAULT_SESSION_LIMITS } from "@/lib/trading/sessionGuard";
import { getAlpacaReadiness, getMarketClock, getStockBars } from "@/lib/trading/brokers/alpaca";
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
  const broker = getAlpacaReadiness();
  try {
    if (broker.configured) {
      const [bars, clock] = await Promise.all([
        getStockBars({ symbol: broker.symbol, limit: 100 }),
        getMarketClock(),
      ]);
      const now = Date.parse(clock.timestamp);
      const close = Date.parse(clock.nextClose);
      const minutesToClose = clock.isOpen && Number.isFinite(now) && Number.isFinite(close)
        ? Math.max(0, Math.ceil((close - now) / 60_000))
        : 0;
      return NextResponse.json({
        ok: true,
        demo: false,
        source: "alpaca",
        symbol: bars.symbol,
        asOf: bars.asOf,
        signal: evaluateScalp(bars.candles),
        market: {
          isOpen: clock.isOpen,
          minutesToClose,
          shouldFlatten: clock.isOpen && minutesToClose <= 15,
          nextOpen: clock.nextOpen,
          nextClose: clock.nextClose,
          source: "alpaca",
        },
        config: DEFAULT_SCALP_CONFIG,
        sessionLimits: DEFAULT_SESSION_LIMITS,
        broker,
      });
    }

    const candles = sampleCandles();
    return NextResponse.json({
      ok: true,
      demo: true,
      source: "demo",
      symbol: broker.symbol,
      asOf: null,
      signal: evaluateScalp(candles),
      market: { ...getMarketState(), source: "local" },
      config: DEFAULT_SCALP_CONFIG,
      sessionLimits: DEFAULT_SESSION_LIMITS,
      broker,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      demo: false,
      source: "alpaca",
      symbol: broker.symbol,
      broker,
      error: error instanceof Error ? error.message : "تعذّر قراءة بيانات السوق من Alpaca.",
    }, { status: 502 });
  }
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
    return NextResponse.json({ ok: true, source: "custom", demo: false, signal: result, market: getMarketState() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Signal evaluation failed" },
      { status: 500 }
    );
  }
}
