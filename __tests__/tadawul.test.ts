import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTadawulMarketState, sampleTadawulOpportunities, TADAWUL_SYMBOLS } from "../lib/trading/markets/tadawul";
import { isSaudiBrokerConfigured, submitSaudiOrder } from "../lib/trading/brokers/saudiBroker";
import { executeApprovedTrade } from "../lib/trading/executeApproval";

// Riyadh is UTC+3; build instants by subtracting 3h to get the UTC value.
function riyadh(hour: number, minute: number, utcDay: number): Date {
  return new Date(Date.UTC(2024, 0, utcDay, hour - 3, minute));
}

describe("tadawul market hours", () => {
  it("is open midday on a trading day (Sunday)", () => {
    // 2024-01-07 is a Sunday
    const state = getTadawulMarketState(riyadh(12, 0, 7));
    expect(state.isTradingDay).toBe(true);
    expect(state.isOpen).toBe(true);
    expect(state.minutesToClose).toBe(180); // 15:00 - 12:00
  });

  it("is closed on Friday", () => {
    // 2024-01-05 is a Friday
    const state = getTadawulMarketState(riyadh(12, 0, 5));
    expect(state.isTradingDay).toBe(false);
    expect(state.isOpen).toBe(false);
  });

  it("is closed before the 10:00 open", () => {
    const state = getTadawulMarketState(riyadh(9, 30, 7));
    expect(state.isOpen).toBe(false);
  });

  it("flags the flatten window near close", () => {
    const state = getTadawulMarketState(riyadh(14, 50, 7));
    expect(state.isOpen).toBe(true);
    expect(state.shouldFlatten).toBe(true);
  });

  it("exposes major symbols and simulated opportunities", () => {
    expect(TADAWUL_SYMBOLS.some((s) => s.code === "2222")).toBe(true);
    const opps = sampleTadawulOpportunities();
    expect(opps.length).toBeGreaterThan(0);
    expect(opps.every((o) => o.assetClass === "TADAWUL")).toBe(true);
  });
});

describe("saudi broker adapter", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.SAUDI_BROKER_API_URL;
    delete process.env.SAUDI_BROKER_API_KEY;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("is not configured by default", () => {
    expect(isSaudiBrokerConfigured()).toBe(false);
  });

  it("simulates an order when no broker is configured", async () => {
    const res = await submitSaudiOrder({ symbol: "2222", qty: 10, side: "buy" });
    expect(res.submitted).toBe(false);
    expect(res.simulated).toBe(true);
    expect(res.reason).toContain("وسيط مرخّص");
  });

  it("routes an approved TADAWUL trade through simulation when unconfigured", async () => {
    const res = await executeApprovedTrade({ assetClass: "TADAWUL", symbol: "2222", allocation: 2850, entryPrice: 28.5 });
    expect(res.executed).toBe(false);
    expect(res.simulated).toBe(true);
    expect(res.qty).toBe(100);
  });
});
