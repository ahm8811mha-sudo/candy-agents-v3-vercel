import { describe, it, expect } from "vitest";
import {
  dailyPnlPct,
  dailyLossLimitHit,
  canOpenNewPosition,
  DEFAULT_SESSION_LIMITS,
  type SessionState,
} from "../lib/trading/sessionGuard";

const base: SessionState = {
  startingEquity: 100_000,
  currentEquity: 100_000,
  openPositions: 0,
  tradesToday: 0,
};

describe("sessionGuard", () => {
  it("computes daily P&L percentage", () => {
    expect(dailyPnlPct({ ...base, currentEquity: 101_000 })).toBeCloseTo(0.01, 5);
    expect(dailyPnlPct({ ...base, currentEquity: 98_000 })).toBeCloseTo(-0.02, 5);
  });

  it("hits the daily loss limit at -2%", () => {
    expect(dailyLossLimitHit({ ...base, currentEquity: 98_000 })).toBe(true);
    expect(dailyLossLimitHit({ ...base, currentEquity: 98_500 })).toBe(false);
  });

  it("blocks new positions after the daily loss limit", () => {
    const result = canOpenNewPosition({ ...base, currentEquity: 97_000 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("الخسارة اليومي");
  });

  it("blocks when max open positions reached", () => {
    const result = canOpenNewPosition({ ...base, openPositions: DEFAULT_SESSION_LIMITS.maxOpenPositions });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("المفتوحة");
  });

  it("blocks when daily trade count reached", () => {
    const result = canOpenNewPosition({ ...base, tradesToday: DEFAULT_SESSION_LIMITS.maxTradesPerDay });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("للصفقات اليومية");
  });

  it("allows a new position within all limits", () => {
    const result = canOpenNewPosition({ ...base, openPositions: 2, tradesToday: 10, currentEquity: 100_500 });
    expect(result.allowed).toBe(true);
  });
});
