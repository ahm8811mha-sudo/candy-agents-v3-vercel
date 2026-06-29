import { describe, it, expect } from "vitest";
import { sma, stddev, rsi, ema, bollingerBands, macd, atr, type Candle } from "../lib/trading/indicators";

describe("indicators", () => {
  describe("sma", () => {
    it("averages the last period values", () => {
      expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
      expect(sma([2, 4, 6], 2)).toBe(5);
    });
    it("returns null with insufficient data", () => {
      expect(sma([1, 2], 5)).toBeNull();
    });
  });

  describe("stddev", () => {
    it("computes population standard deviation", () => {
      // values 2,4,4,4,5,5,7,9 → mean 5, population sd = 2
      expect(stddev([2, 4, 4, 4, 5, 5, 7, 9], 8)).toBeCloseTo(2, 5);
    });
  });

  describe("rsi", () => {
    it("returns 100 when there are only gains", () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
      expect(rsi(closes, 14)).toBe(100);
    });
    it("is low when there are only losses", () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
      const value = rsi(closes, 14)!;
      expect(value).toBeLessThan(5);
    });
    it("sits mid-range for choppy data", () => {
      const closes = [44, 44.5, 44.2, 44.8, 44.3, 45, 44.6, 45.2, 44.9, 45.5, 45.1, 45.7, 45.3, 45.9, 45.4, 46];
      const value = rsi(closes, 14)!;
      expect(value).toBeGreaterThan(40);
      expect(value).toBeLessThan(100);
    });
    it("returns null with insufficient data", () => {
      expect(rsi([1, 2, 3], 14)).toBeNull();
    });
  });

  describe("ema", () => {
    it("tracks toward recent values", () => {
      const value = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)!;
      expect(value).toBeGreaterThan(5);
      expect(value).toBeLessThanOrEqual(10);
    });
  });

  describe("bollingerBands", () => {
    it("centers on the SMA with symmetric bands", () => {
      const closes = Array.from({ length: 20 }, () => 50);
      const bb = bollingerBands(closes, 20, 2)!;
      expect(bb.middle).toBe(50);
      // zero variance → bands collapse onto the middle
      expect(bb.upper).toBe(50);
      expect(bb.lower).toBe(50);
    });
    it("widens with volatility and stays ordered", () => {
      const closes = [10, 12, 11, 13, 9, 14, 8, 15, 10, 12, 11, 13, 9, 14, 8, 15, 10, 12, 11, 20];
      const bb = bollingerBands(closes, 20, 2)!;
      expect(bb.upper).toBeGreaterThan(bb.middle);
      expect(bb.lower).toBeLessThan(bb.middle);
    });
  });

  describe("macd", () => {
    it("is positive for a sustained uptrend", () => {
      const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
      const result = macd(closes)!;
      expect(result.macd).toBeGreaterThan(0);
    });
    it("returns null with insufficient data", () => {
      expect(macd([1, 2, 3])).toBeNull();
    });
  });

  describe("atr", () => {
    it("computes average true range", () => {
      const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        high: 11 + i * 0.1,
        low: 9 + i * 0.1,
        close: 10 + i * 0.1,
      }));
      const value = atr(candles, 14)!;
      expect(value).toBeGreaterThan(0);
    });
    it("returns null with insufficient data", () => {
      expect(atr([{ high: 1, low: 0, close: 0.5 }], 14)).toBeNull();
    });
  });
});
