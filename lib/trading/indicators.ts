/**
 * Technical indicators for the scalping strategy.
 *
 * All pure functions over numeric series / candles so they are fully unit
 * testable. Each returns the latest value (or null when there is insufficient
 * data). Standard formulas: RSI & ATR use Wilder's smoothing; MACD uses EMA.
 */

export type Candle = {
  high: number;
  low: number;
  close: number;
  open?: number;
  volume?: number;
};

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/** Population standard deviation of the last `period` values. */
export function stddev(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

/** RSI with Wilder's smoothing. Needs at least period + 1 closes. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Full EMA series (seeded from the first value). */
export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series.length ? series[series.length - 1] : null;
}

export type BollingerBands = { upper: number; middle: number; lower: number };

export function bollingerBands(
  closes: number[],
  period = 20,
  multiplier = 2
): BollingerBands | null {
  const middle = sma(closes, period);
  const sd = stddev(closes, period);
  if (middle === null || sd === null) return null;
  return {
    upper: middle + multiplier * sd,
    middle,
    lower: middle - multiplier * sd,
  };
}

export type Macd = { macd: number; signal: number; histogram: number };

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): Macd | null {
  if (closes.length < slow) return null;
  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  const macdSeries = closes.map((_, i) => fastSeries[i] - slowSeries[i]);
  const signalSeries = emaSeries(macdSeries, signalPeriod);

  const macdValue = macdSeries[macdSeries.length - 1];
  const signalValue = signalSeries[signalSeries.length - 1];
  return {
    macd: macdValue,
    signal: signalValue,
    histogram: macdValue - signalValue,
  };
}

/** Average True Range (Wilder). Needs at least period + 1 candles. */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    );
  }

  let atrValue = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atrValue = (atrValue * (period - 1) + trueRanges[i]) / period;
  }
  return atrValue;
}
