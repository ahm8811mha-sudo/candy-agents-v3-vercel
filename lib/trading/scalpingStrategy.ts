/**
 * Conservative scalping strategy (focusflow port).
 *
 * Combines RSI + Bollinger Bands + MACD, gated by an ATR/price volatility
 * filter. Scalping wants calm conditions, so trades are only allowed when
 * ATR/price is at or below the configured ceiling (default 0.5%). On a valid
 * entry it returns take-profit / stop-loss levels (default TP 0.3% / SL 0.2%).
 *
 * Pure function — no I/O — so the decision logic is fully testable.
 */

import { rsi, bollingerBands, macd, atr, type Candle } from "./indicators";

export type ScalpConfig = {
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  bbPeriod: number;
  bbMultiplier: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atrPeriod: number;
  volatilityMaxPct: number; // ATR/price ceiling (e.g. 0.005 = 0.5%)
  takeProfitPct: number; // e.g. 0.003 = 0.3%
  stopLossPct: number; // e.g. 0.002 = 0.2%
};

export const DEFAULT_SCALP_CONFIG: ScalpConfig = {
  rsiPeriod: 14,
  rsiOversold: 35,
  rsiOverbought: 65,
  bbPeriod: 20,
  bbMultiplier: 2,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  atrPeriod: 14,
  volatilityMaxPct: 0.005,
  takeProfitPct: 0.003,
  stopLossPct: 0.002,
};

export type ScalpSignal = "BUY" | "SELL" | "HOLD" | "FILTERED";

export type ScalpResult = {
  signal: ScalpSignal;
  reason: string;
  price: number;
  takeProfit: number | null;
  stopLoss: number | null;
  volatilityPct: number | null;
  indicators: {
    rsi: number | null;
    bb: { upper: number; middle: number; lower: number } | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    atr: number | null;
  };
};

export function evaluateScalp(
  candles: Candle[],
  config: ScalpConfig = DEFAULT_SCALP_CONFIG
): ScalpResult {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];

  const rsiValue = rsi(closes, config.rsiPeriod);
  const bb = bollingerBands(closes, config.bbPeriod, config.bbMultiplier);
  const macdValue = macd(closes, config.macdFast, config.macdSlow, config.macdSignal);
  const atrValue = atr(candles, config.atrPeriod);

  const indicators = { rsi: rsiValue, bb, macd: macdValue, atr: atrValue };
  const volatilityPct = atrValue !== null && price > 0 ? atrValue / price : null;

  const base: ScalpResult = {
    signal: "HOLD",
    reason: "",
    price,
    takeProfit: null,
    stopLoss: null,
    volatilityPct,
    indicators,
  };

  if (rsiValue === null || bb === null || macdValue === null || atrValue === null) {
    return { ...base, reason: "بيانات غير كافية لحساب المؤشرات" };
  }

  // Volatility filter — scalping only in calm markets.
  if (volatilityPct !== null && volatilityPct > config.volatilityMaxPct) {
    return {
      ...base,
      signal: "FILTERED",
      reason: `التذبذب ${(volatilityPct * 100).toFixed(2)}% يتجاوز الحد ${(config.volatilityMaxPct * 100).toFixed(2)}% — لا تداول`,
    };
  }

  // Conservative long entry: price at/below lower band, RSI oversold,
  // MACD momentum turning up (histogram positive).
  const longSetup =
    price <= bb.lower * 1.001 &&
    rsiValue <= config.rsiOversold &&
    macdValue.histogram > 0;

  // Exit / short setup: price at/above upper band, RSI overbought,
  // MACD momentum turning down.
  const shortSetup =
    price >= bb.upper * 0.999 &&
    rsiValue >= config.rsiOverbought &&
    macdValue.histogram < 0;

  if (longSetup) {
    return {
      ...base,
      signal: "BUY",
      reason: `دخول شراء: السعر عند الباند السفلي، RSI=${rsiValue.toFixed(1)}, زخم MACD إيجابي`,
      takeProfit: round2(price * (1 + config.takeProfitPct)),
      stopLoss: round2(price * (1 - config.stopLossPct)),
    };
  }

  if (shortSetup) {
    return {
      ...base,
      signal: "SELL",
      reason: `خروج/بيع: السعر عند الباند العلوي، RSI=${rsiValue.toFixed(1)}, زخم MACD سلبي`,
      takeProfit: round2(price * (1 - config.takeProfitPct)),
      stopLoss: round2(price * (1 + config.stopLossPct)),
    };
  }

  return {
    ...base,
    reason: `لا توجد إشارة واضحة: RSI=${rsiValue.toFixed(1)}, السعر بين الباندات`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
