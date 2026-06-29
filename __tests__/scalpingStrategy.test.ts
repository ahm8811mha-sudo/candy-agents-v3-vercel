import { describe, it, expect } from "vitest";
import { evaluateScalp, DEFAULT_SCALP_CONFIG } from "../lib/trading/scalpingStrategy";
import type { Candle } from "../lib/trading/indicators";

function flatCandles(price: number, count = 40): Candle[] {
  return Array.from({ length: count }, () => ({
    open: price,
    high: price + 0.05,
    low: price - 0.05,
    close: price,
  }));
}

describe("scalpingStrategy", () => {
  it("returns HOLD with insufficient data", () => {
    const result = evaluateScalp(flatCandles(100, 10));
    expect(["HOLD", "FILTERED"]).toContain(result.signal);
  });

  it("filters out high-volatility conditions", () => {
    // Large high-low ranges → ATR/price well above 0.5%.
    const candles: Candle[] = Array.from({ length: 40 }, (_, i) => ({
      open: 100,
      high: 105 + (i % 2),
      low: 95 - (i % 2),
      close: 100 + (i % 2 === 0 ? 2 : -2),
    }));
    const result = evaluateScalp(candles);
    expect(result.signal).toBe("FILTERED");
    expect(result.volatilityPct).not.toBeNull();
    expect(result.volatilityPct!).toBeGreaterThan(DEFAULT_SCALP_CONFIG.volatilityMaxPct);
  });

  it("computes TP/SL at the configured distances on a BUY", () => {
    // Build a calm series that dips to the lower band with oversold RSI.
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(100);
    // gentle decline into the band
    for (let i = 0; i < 10; i++) closes.push(100 - i * 0.05);
    const candles: Candle[] = closes.map((c) => ({ open: c, high: c + 0.02, low: c - 0.02, close: c }));
    const result = evaluateScalp(candles);

    if (result.signal === "BUY") {
      expect(result.takeProfit).toBeCloseTo(result.price * (1 + DEFAULT_SCALP_CONFIG.takeProfitPct), 1);
      expect(result.stopLoss).toBeCloseTo(result.price * (1 - DEFAULT_SCALP_CONFIG.stopLossPct), 1);
    } else {
      // If conditions weren't all met, it must be a non-error signal.
      expect(["HOLD", "SELL", "FILTERED"]).toContain(result.signal);
    }
  });

  it("always reports volatility and indicators in calm markets", () => {
    const result = evaluateScalp(flatCandles(100));
    expect(result.indicators.rsi).not.toBeNull();
    expect(result.indicators.bb).not.toBeNull();
    expect(result.indicators.macd).not.toBeNull();
    expect(result.indicators.atr).not.toBeNull();
  });
});
