/**
 * Alpaca broker adapter.
 *
 * Defaults to PAPER trading (real API, virtual money) — the safe default for an
 * automated scalping strategy. Live (real-money) trading is used only when
 * ALPACA_LIVE=true is explicitly set AND credentials are present. Every order
 * path therefore requires deliberate operator action before real funds move.
 *
 * Credentials: ALPACA_API_KEY, ALPACA_API_SECRET, optional ALPACA_LIVE.
 */

const PAPER_BASE = "https://paper-api.alpaca.markets";
const LIVE_BASE = "https://api.alpaca.markets";

export type AlpacaMode = "paper" | "live";

export function isAlpacaConfigured(): boolean {
  return Boolean(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
}

/** Live only with an explicit opt-in; otherwise paper. */
export function alpacaMode(): AlpacaMode {
  return process.env.ALPACA_LIVE === "true" ? "live" : "paper";
}

function baseUrl(): string {
  return alpacaMode() === "live" ? LIVE_BASE : PAPER_BASE;
}

function headers(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET || "",
    "Content-Type": "application/json",
  };
}

export type AlpacaAccount = {
  mode: AlpacaMode;
  equity: number;
  cash: number;
  buyingPower: number;
  status: string;
};

async function alpacaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isAlpacaConfigured()) throw new Error("Alpaca is not configured.");
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers: headers(), cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Alpaca API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function getAccount(): Promise<AlpacaAccount> {
  const raw = await alpacaFetch<{ equity: string; cash: string; buying_power: string; status: string }>("/v2/account");
  return {
    mode: alpacaMode(),
    equity: Number(raw.equity) || 0,
    cash: Number(raw.cash) || 0,
    buyingPower: Number(raw.buying_power) || 0,
    status: raw.status,
  };
}

export type AlpacaOrderInput = {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  takeProfit?: number;
  stopLoss?: number;
};

/**
 * Submit a bracket order (entry + take-profit + stop-loss) — matches the
 * strategy's per-trade TP/SL. Routes to paper unless live is explicitly enabled.
 */
export async function submitBracketOrder(order: AlpacaOrderInput): Promise<{ id: string; mode: AlpacaMode }> {
  const body: Record<string, unknown> = {
    symbol: order.symbol,
    qty: order.qty,
    side: order.side,
    type: "market",
    time_in_force: "day",
  };
  if (order.takeProfit && order.stopLoss) {
    body.order_class = "bracket";
    body.take_profit = { limit_price: order.takeProfit };
    body.stop_loss = { stop_price: order.stopLoss };
  }
  const raw = await alpacaFetch<{ id: string }>("/v2/orders", { method: "POST", body: JSON.stringify(body) });
  return { id: raw.id, mode: alpacaMode() };
}

/** Flatten everything — used in the pre-close window. */
export async function closeAllPositions(): Promise<{ closed: boolean; mode: AlpacaMode }> {
  await alpacaFetch("/v2/positions", { method: "DELETE" });
  return { closed: true, mode: alpacaMode() };
}
