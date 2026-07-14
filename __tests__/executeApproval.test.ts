import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeApprovedTrade } from "../lib/trading/executeApproval";

describe("executeApprovedTrade", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_API_SECRET;
    delete process.env.ALPACA_LIVE;
    delete process.env.APCA_API_KEY_ID;
    delete process.env.APCA_API_SECRET_KEY;
    delete process.env.TRADING_LIVE_ENABLED;
    delete process.env.TRADING_LIVE_ACK;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("treats business opportunities as simulation-only (not sent to broker)", async () => {
    const res = await executeApprovedTrade({ assetClass: "BUSINESS", symbol: "INV-RESTOCK", allocation: 5000, entryPrice: 1 });
    expect(res.executed).toBe(false);
    expect(res.simulated).toBe(true);
    expect(res.reason).toContain("غير قابل للتداول");
  });

  it("treats forex as simulation-only", async () => {
    const res = await executeApprovedTrade({ assetClass: "FOREX", symbol: "EUR/USD", allocation: 5000, entryPrice: 1.08 });
    expect(res.executed).toBe(false);
    expect(res.simulated).toBe(true);
  });

  it("simulates equity when Alpaca is not configured", async () => {
    const res = await executeApprovedTrade({ assetClass: "EQUITY", symbol: "AAPL", allocation: 14550, entryPrice: 195 });
    expect(res.executed).toBe(false);
    expect(res.simulated).toBe(true);
    expect(res.reason).toContain("Alpaca غير مُهيّأ");
  });

  it("rejects invalid price/allocation even when configured", async () => {
    process.env.ALPACA_API_KEY = "k";
    process.env.ALPACA_API_SECRET = "s";
    const res = await executeApprovedTrade({ assetClass: "EQUITY", symbol: "AAPL", allocation: 0, entryPrice: 0 });
    expect(res.executed).toBe(false);
    expect(res.reason).toContain("غير صالحة");
  });
});
