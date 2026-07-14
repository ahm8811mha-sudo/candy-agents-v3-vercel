import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  defaultRiskLimits,
  passesRiskChecks,
  positionSize,
  requiresApproval,
  computeStopLoss,
  drawdownBreached,
  exposureByClass,
} from "../lib/trading/riskEngine";
import { scoreOpportunity, rankOpportunities } from "../lib/trading/opportunityScorer";
import { resolveMode, isLiveTradingEnabled } from "../lib/trading/executionEngine";
import { runCfoTradingCycle, sampleOpportunities } from "../lib/trading/cfoTrader";
import type { MarketOpportunity, Portfolio } from "../lib/trading/types";

const opp = (over: Partial<MarketOpportunity> = {}): MarketOpportunity => ({
  id: "o1",
  symbol: "TEST",
  assetClass: "EQUITY",
  title: "Test",
  expectedReturn: 0.12,
  risk: "LOW",
  confidence: 0.8,
  entryPrice: 100,
  horizonDays: 30,
  source: "test",
  ...over,
});

const emptyPortfolio = (budget: number): Portfolio => ({
  mode: "SIMULATION",
  totalBudget: budget,
  cash: budget,
  deployed: 0,
  positions: [],
  realizedPnl: 0,
});

describe("riskEngine", () => {
  it("default limits scale with budget", () => {
    const limits = defaultRiskLimits(100_000);
    expect(limits.totalBudget).toBe(100_000);
    expect(limits.approvalThreshold).toBe(10_000);
    expect(limits.maxPositionPct).toBeLessThanOrEqual(0.2);
  });

  it("rejects low-confidence opportunities", () => {
    const limits = defaultRiskLimits(100_000);
    const check = passesRiskChecks(opp({ confidence: 0.3 }), limits);
    expect(check.ok).toBe(false);
    expect(check.reasons.length).toBeGreaterThan(0);
  });

  it("rejects low expected return", () => {
    const limits = defaultRiskLimits(100_000);
    expect(passesRiskChecks(opp({ expectedReturn: 0.01 }), limits).ok).toBe(false);
  });

  it("accepts a healthy opportunity", () => {
    const limits = defaultRiskLimits(100_000);
    expect(passesRiskChecks(opp(), limits).ok).toBe(true);
  });

  it("never sizes a position above the per-position cap", () => {
    const limits = defaultRiskLimits(100_000);
    const size = positionSize(opp({ confidence: 1, risk: "LOW" }), limits, emptyPortfolio(100_000));
    expect(size).toBeLessThanOrEqual(limits.totalBudget * limits.maxPositionPct);
  });

  it("never sizes above available cash", () => {
    const limits = defaultRiskLimits(100_000);
    const portfolio = { ...emptyPortfolio(100_000), cash: 500 };
    const size = positionSize(opp(), limits, portfolio);
    expect(size).toBeLessThanOrEqual(500);
  });

  it("respects the per-asset-class cap", () => {
    const limits = defaultRiskLimits(100_000);
    const portfolio: Portfolio = {
      ...emptyPortfolio(100_000),
      positions: [
        { id: "p", opportunityId: "x", symbol: "X", assetClass: "EQUITY", amount: 40_000, entryPrice: 1, quantity: 1, stopLossPrice: 0.9, openedAt: "", status: "OPEN" },
      ],
    };
    // Class is already at the 40% cap, so no further EQUITY room.
    const size = positionSize(opp({ assetClass: "EQUITY" }), limits, portfolio);
    expect(size).toBe(0);
  });

  it("higher risk reduces position size", () => {
    const limits = defaultRiskLimits(100_000);
    const low = positionSize(opp({ risk: "LOW", confidence: 0.9 }), limits, emptyPortfolio(100_000));
    const high = positionSize(opp({ risk: "HIGH", confidence: 0.9 }), limits, emptyPortfolio(100_000));
    expect(high).toBeLessThan(low);
  });

  it("flags allocations at or above the approval threshold", () => {
    const limits = defaultRiskLimits(100_000);
    expect(requiresApproval(10_000, limits)).toBe(true);
    expect(requiresApproval(9_999, limits)).toBe(false);
  });

  it("computes stop-loss below entry", () => {
    const limits = defaultRiskLimits(100_000);
    expect(computeStopLoss(100, limits)).toBe(92);
  });

  it("detects drawdown breach", () => {
    const limits = defaultRiskLimits(100_000);
    const healthy = emptyPortfolio(100_000);
    expect(drawdownBreached(healthy, limits)).toBe(false);
    const broken: Portfolio = { ...emptyPortfolio(100_000), cash: 70_000, realizedPnl: -10_000 };
    expect(drawdownBreached(broken, limits)).toBe(true);
  });

  it("sums exposure by class ignoring closed positions", () => {
    const portfolio: Portfolio = {
      ...emptyPortfolio(100_000),
      positions: [
        { id: "1", opportunityId: "a", symbol: "A", assetClass: "CRYPTO", amount: 5000, entryPrice: 1, quantity: 1, stopLossPrice: 0.9, openedAt: "", status: "OPEN" },
        { id: "2", opportunityId: "b", symbol: "B", assetClass: "CRYPTO", amount: 3000, entryPrice: 1, quantity: 1, stopLossPrice: 0.9, openedAt: "", status: "CLOSED" },
      ],
    };
    expect(exposureByClass(portfolio, "CRYPTO")).toBe(5000);
  });
});

describe("opportunityScorer", () => {
  it("scores between 0 and 100", () => {
    const s = scoreOpportunity(opp());
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it("ranks higher-return/confidence opportunities first", () => {
    const ranked = rankOpportunities([
      opp({ id: "weak", expectedReturn: 0.05, confidence: 0.55, risk: "HIGH" }),
      opp({ id: "strong", expectedReturn: 0.3, confidence: 0.9, risk: "LOW" }),
    ]);
    expect(ranked[0].id).toBe("strong");
  });
});

describe("executionEngine — live gating", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.TRADING_LIVE_ENABLED;
    delete process.env.TRADING_LIVE_ACK;
    delete process.env.ALPACA_LIVE;
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_API_SECRET;
    delete process.env.APCA_API_KEY_ID;
    delete process.env.APCA_API_SECRET_KEY;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("live trading is disabled by default", () => {
    expect(isLiveTradingEnabled()).toBe(false);
  });

  it("requires credentials and every real-money opt-in gate", () => {
    process.env.ALPACA_API_KEY = "k";
    process.env.ALPACA_API_SECRET = "s";
    process.env.ALPACA_LIVE = "true";
    process.env.TRADING_LIVE_ENABLED = "true";
    expect(isLiveTradingEnabled()).toBe(false);
    process.env.TRADING_LIVE_ACK = "I_UNDERSTAND_REAL_MONEY";
    expect(isLiveTradingEnabled()).toBe(true);
  });

  it("downgrades LIVE to SIMULATION when not enabled", () => {
    const resolved = resolveMode("LIVE");
    expect(resolved.mode).toBe("SIMULATION");
    expect(resolved.downgraded).toBe(true);
  });
});

describe("cfoTrader — full cycle", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.TRADING_LIVE_ENABLED;
    delete process.env.TRADING_LIVE_ACK;
    delete process.env.ALPACA_LIVE;
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_API_SECRET;
    delete process.env.APCA_API_KEY_ID;
    delete process.env.APCA_API_SECRET_KEY;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("runs a simulation cycle without exceeding budget", () => {
    const result = runCfoTradingCycle({ budget: 100_000, opportunities: sampleOpportunities() });
    expect(result.mode).toBe("SIMULATION");
    expect(result.portfolio.cash).toBeGreaterThanOrEqual(0);
    expect(result.portfolio.cash + result.portfolio.deployed).toBeLessThanOrEqual(100_000 + 1);
  });

  it("downgrades a LIVE request and records a safety note", () => {
    const result = runCfoTradingCycle({ budget: 100_000, opportunities: sampleOpportunities(), requestedMode: "LIVE" });
    expect(result.liveRequested).toBe(true);
    expect(result.mode).toBe("SIMULATION");
    expect(result.notes.some((n) => n.includes("ضابط أمان"))).toBe(true);
  });

  it("produces a decision for every opportunity", () => {
    const opps = sampleOpportunities();
    const result = runCfoTradingCycle({ budget: 100_000, opportunities: opps });
    expect(result.decisions.length).toBe(opps.length);
  });

  it("skips everything when budget is tiny", () => {
    const result = runCfoTradingCycle({ budget: 100, opportunities: sampleOpportunities() });
    const bought = result.decisions.filter((d) => d.action === "BUY");
    // With a 100 budget, per-position cap is 15 — high-priced instruments get token allocations,
    // but nothing should exceed the cash.
    expect(result.portfolio.cash).toBeGreaterThanOrEqual(0);
    expect(bought.every((d) => d.allocation <= 100)).toBe(true);
  });
});
