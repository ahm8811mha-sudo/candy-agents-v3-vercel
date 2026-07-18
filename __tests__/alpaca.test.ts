import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alpacaMode,
  getAccount,
  getAlpacaReadiness,
  getMarketClock,
  getStockBars,
  isAlpacaConfigured,
  isAlpacaLiveEnabled,
  submitBracketOrder,
} from "../lib/trading/brokers/alpaca";

const original = { ...process.env };

function clearAlpacaEnv() {
  delete process.env.ALPACA_API_KEY;
  delete process.env.ALPACA_API_SECRET;
  delete process.env.APCA_API_KEY_ID;
  delete process.env.APCA_API_SECRET_KEY;
  delete process.env.ALPACA_LIVE;
  delete process.env.TRADING_LIVE_ENABLED;
  delete process.env.TRADING_LIVE_ACK;
  delete process.env.ALPACA_SCALP_SYMBOL;
  delete process.env.ALPACA_DATA_FEED;
}

function configurePaper() {
  process.env.ALPACA_API_KEY = "paper-key";
  process.env.ALPACA_API_SECRET = "paper-secret";
}

describe("Alpaca broker safety and market data", () => {
  beforeEach(() => {
    clearAlpacaEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it("accepts Alpaca official credential aliases and defaults to paper", () => {
    process.env.APCA_API_KEY_ID = "official-key";
    process.env.APCA_API_SECRET_KEY = "official-secret";

    expect(isAlpacaConfigured()).toBe(true);
    expect(alpacaMode()).toBe("paper");
    expect(getAlpacaReadiness()).toMatchObject({
      configured: true,
      mode: "paper",
      liveEnabled: false,
      credentialsSource: "alpaca",
      symbol: "SPY",
      feed: "iex",
    });
  });

  it("never enables live unless credentials and all three gates match", () => {
    configurePaper();
    process.env.ALPACA_LIVE = "true";
    process.env.TRADING_LIVE_ENABLED = "true";
    expect(isAlpacaLiveEnabled()).toBe(false);
    expect(alpacaMode()).toBe("paper");

    process.env.TRADING_LIVE_ACK = "I_UNDERSTAND_REAL_MONEY";
    expect(isAlpacaLiveEnabled()).toBe(true);
    expect(alpacaMode()).toBe("live");
  });

  it("reads account and clock from the paper trading base", async () => {
    configurePaper();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        equity: "100000",
        cash: "85000",
        buying_power: "170000",
        status: "ACTIVE",
        trading_blocked: false,
        account_blocked: false,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        timestamp: "2026-07-15T14:00:00Z",
        is_open: true,
        next_open: "2026-07-16T13:30:00Z",
        next_close: "2026-07-15T20:00:00Z",
      }), { status: 200 }));

    await expect(getAccount()).resolves.toMatchObject({ mode: "paper", equity: 100000, cash: 85000 });
    await expect(getMarketClock()).resolves.toMatchObject({ isOpen: true, nextClose: "2026-07-15T20:00:00Z" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://paper-api.alpaca.markets/v2/account");
    expect(fetchMock.mock.calls[1][0]).toBe("https://paper-api.alpaca.markets/v2/clock");
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["APCA-API-KEY-ID"]).toBe("paper-key");
  });

  it("uses real Alpaca bars in chronological order for the configured symbol", async () => {
    configurePaper();
    process.env.ALPACA_SCALP_SYMBOL = "AAPL";
    const bars = Array.from({ length: 45 }, (_, index) => ({
      t: new Date(Date.UTC(2026, 6, 15, 15, 44 - index)).toISOString(),
      o: 200 - index,
      h: 201 - index,
      l: 199 - index,
      c: 200.5 - index,
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ bars }), { status: 200 })
    );

    const result = await getStockBars({ limit: 45 });
    expect(result.symbol).toBe("AAPL");
    expect(result.candles).toHaveLength(45);
    expect(result.candles[0].open).toBe(156);
    expect(result.candles.at(-1)?.open).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://data.alpaca.markets/v2/stocks/AAPL/bars?");
    expect(String(fetchMock.mock.calls[0][0])).toContain("feed=iex");
  });

  it("adds a deterministic client order id and remains on paper by default", async () => {
    configurePaper();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "paper-order-1" }), { status: 200 })
    );

    await expect(submitBracketOrder({
      symbol: "AAPL",
      qty: 2,
      side: "buy",
      takeProfit: 205,
      stopLoss: 195,
      clientOrderId: "orvanta-approval/42",
    })).resolves.toEqual({ id: "paper-order-1", mode: "paper" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://paper-api.alpaca.markets/v2/orders");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.client_order_id).toBe("orvanta-approval-42");
    expect(body.order_class).toBe("bracket");
  });
});
