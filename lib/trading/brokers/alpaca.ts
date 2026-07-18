/**
 * Alpaca Trading API adapter.
 *
 * Paper is the immutable default. Live requires credentials plus three explicit
 * server-side acknowledgements so a copied environment cannot move real money.
 * Both Orvanta's legacy names and Alpaca's official APCA names are accepted.
 */

import type { Candle } from "../indicators";

const PAPER_BASE = "https://paper-api.alpaca.markets";
const LIVE_BASE = "https://api.alpaca.markets";
const DATA_BASE = "https://data.alpaca.markets";
const REQUEST_TIMEOUT_MS = 10_000;

export type AlpacaMode = "paper" | "live";

function apiKey() {
  return process.env.ALPACA_API_KEY?.trim() || process.env.APCA_API_KEY_ID?.trim() || "";
}

function apiSecret() {
  return process.env.ALPACA_API_SECRET?.trim() || process.env.APCA_API_SECRET_KEY?.trim() || "";
}

export function isAlpacaConfigured(): boolean {
  return Boolean(apiKey() && apiSecret());
}

export function isAlpacaLiveEnabled(): boolean {
  return Boolean(
    isAlpacaConfigured() &&
    process.env.ALPACA_LIVE === "true" &&
    process.env.TRADING_LIVE_ENABLED === "true" &&
    process.env.TRADING_LIVE_ACK === "I_UNDERSTAND_REAL_MONEY"
  );
}

/** Live only after the complete three-part opt-in; otherwise paper. */
export function alpacaMode(): AlpacaMode {
  return isAlpacaLiveEnabled() ? "live" : "paper";
}

export function getAlpacaReadiness() {
  const configured = isAlpacaConfigured();
  const liveRequested = process.env.ALPACA_LIVE === "true";
  const missingEnvironmentVariables: string[] = [];
  if (!apiKey()) missingEnvironmentVariables.push("ALPACA_API_KEY (أو APCA_API_KEY_ID)");
  if (!apiSecret()) missingEnvironmentVariables.push("ALPACA_API_SECRET (أو APCA_API_SECRET_KEY)");

  return {
    configured,
    mode: alpacaMode(),
    liveRequested,
    liveEnabled: isAlpacaLiveEnabled(),
    credentialsSource: process.env.ALPACA_API_KEY || process.env.ALPACA_API_SECRET ? "orvanta" : process.env.APCA_API_KEY_ID || process.env.APCA_API_SECRET_KEY ? "alpaca" : "none",
    missingEnvironmentVariables,
    symbol: scalpSymbol(),
    feed: dataFeed(),
  };
}

function baseUrl(): string {
  return alpacaMode() === "live" ? LIVE_BASE : PAPER_BASE;
}

function headers(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": apiKey(),
    "APCA-API-SECRET-KEY": apiSecret(),
    "Content-Type": "application/json",
  };
}

function scalpSymbol() {
  const value = (process.env.ALPACA_SCALP_SYMBOL || "SPY").trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(value) ? value : "SPY";
}

function dataFeed() {
  return process.env.ALPACA_DATA_FEED === "sip" ? "sip" : "iex";
}

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function authorizedFetch<T>(url: string, init?: RequestInit): Promise<T> {
  if (!isAlpacaConfigured()) throw new Error("Alpaca is not configured.");
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
    cache: "no-store",
    signal: init?.signal || timeoutSignal(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Alpaca API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function tradingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return authorizedFetch<T>(`${baseUrl()}${path}`, init);
}

export type AlpacaAccount = {
  mode: AlpacaMode;
  equity: number;
  cash: number;
  buyingPower: number;
  status: string;
  tradingBlocked: boolean;
  accountBlocked: boolean;
};

export async function getAccount(): Promise<AlpacaAccount> {
  const raw = await tradingFetch<{
    equity: string;
    cash: string;
    buying_power: string;
    status: string;
    trading_blocked?: boolean;
    account_blocked?: boolean;
  }>("/v2/account");
  return {
    mode: alpacaMode(),
    equity: Number(raw.equity) || 0,
    cash: Number(raw.cash) || 0,
    buyingPower: Number(raw.buying_power) || 0,
    status: raw.status,
    tradingBlocked: Boolean(raw.trading_blocked),
    accountBlocked: Boolean(raw.account_blocked),
  };
}

export type AlpacaMarketClock = {
  timestamp: string;
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
};

export async function getMarketClock(): Promise<AlpacaMarketClock> {
  const raw = await tradingFetch<{ timestamp: string; is_open: boolean; next_open: string; next_close: string }>("/v2/clock");
  return {
    timestamp: raw.timestamp,
    isOpen: raw.is_open,
    nextOpen: raw.next_open,
    nextClose: raw.next_close,
  };
}

export async function getStockBars(input?: { symbol?: string; limit?: number }): Promise<{ symbol: string; candles: Candle[]; asOf: string | null }> {
  const symbol = input?.symbol?.trim().toUpperCase() || scalpSymbol();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error("رمز السهم غير صالح.");
  const limit = Math.min(Math.max(input?.limit || 100, 40), 1000);
  const start = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString();
  const params = new URLSearchParams({
    timeframe: "1Min",
    start,
    limit: String(limit),
    adjustment: "raw",
    feed: dataFeed(),
    sort: "desc",
  });
  const raw = await authorizedFetch<{ bars?: Array<{ t: string; o: number; h: number; l: number; c: number }> }>(
    `${DATA_BASE}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`
  );
  const bars = (raw.bars || []).filter((bar) => [bar.o, bar.h, bar.l, bar.c].every(Number.isFinite)).slice(0, limit);
  const candles = bars.slice().reverse().map((bar) => ({ open: bar.o, high: bar.h, low: bar.l, close: bar.c }));
  if (candles.length < 40) throw new Error(`Alpaca أعاد ${candles.length} شمعة فقط؛ يلزم 40 شمعة لحساب الإشارة.`);
  return { symbol, candles, asOf: bars[0]?.t || null };
}

export type AlpacaOrderInput = {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  takeProfit?: number;
  stopLoss?: number;
  clientOrderId?: string;
};

/** Submit a bracket order. Routes to paper unless every live gate is enabled. */
export async function submitBracketOrder(order: AlpacaOrderInput): Promise<{ id: string; mode: AlpacaMode }> {
  const body: Record<string, unknown> = {
    symbol: order.symbol,
    qty: order.qty,
    side: order.side,
    type: "market",
    time_in_force: "day",
  };
  if (order.clientOrderId) body.client_order_id = order.clientOrderId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  if (order.takeProfit && order.stopLoss) {
    body.order_class = "bracket";
    body.take_profit = { limit_price: order.takeProfit };
    body.stop_loss = { stop_price: order.stopLoss };
  }
  const raw = await tradingFetch<{ id: string }>("/v2/orders", { method: "POST", body: JSON.stringify(body) });
  return { id: raw.id, mode: alpacaMode() };
}

/** Flatten everything — used only after an explicit operator action. */
export async function closeAllPositions(): Promise<{ closed: boolean; mode: AlpacaMode }> {
  await tradingFetch("/v2/positions?cancel_orders=true", { method: "DELETE" });
  return { closed: true, mode: alpacaMode() };
}
