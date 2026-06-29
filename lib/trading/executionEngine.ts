/**
 * Execution engine.
 *
 * SIMULATION (paper) is the default and only fully-implemented path: it creates
 * positions against virtual cash, applying the computed stop-loss.
 *
 * LIVE execution is intentionally NOT wired to any brokerage. Placing real
 * orders requires the operator to supply a broker adapter and explicitly enable
 * live mode. Until then, any live request transparently degrades to simulation
 * and is flagged in the cycle notes. This is a deliberate safety control.
 */

import type {
  MarketOpportunity,
  Position,
  RiskLimits,
  TradingMode,
} from "./types";
import { computeStopLoss } from "./riskEngine";

/**
 * Live trading is enabled only when BOTH an explicit opt-in flag is set AND a
 * broker adapter is configured. We ship no adapter, so this returns false by
 * default — real money is never at risk without deliberate operator action.
 */
export function isLiveTradingEnabled(): boolean {
  const optIn = process.env.TRADING_LIVE_ENABLED === "true";
  const hasBroker = Boolean(process.env.BROKER_API_KEY && process.env.BROKER_API_SECRET);
  return optIn && hasBroker;
}

/** Resolve the effective mode, downgrading LIVE to SIMULATION when not enabled. */
export function resolveMode(requested: TradingMode): {
  mode: TradingMode;
  downgraded: boolean;
} {
  if (requested === "LIVE" && !isLiveTradingEnabled()) {
    return { mode: "SIMULATION", downgraded: true };
  }
  return { mode: requested, downgraded: false };
}

function id() {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Open a position. In SIMULATION this is a pure virtual fill. (A LIVE path would
 * call the broker adapter here — not implemented by design.)
 */
export function openPosition(
  opp: MarketOpportunity,
  allocation: number,
  limits: RiskLimits,
  mode: TradingMode,
  needsApproval: boolean
): Position {
  const quantity = opp.entryPrice > 0 ? allocation / opp.entryPrice : 0;
  return {
    id: id(),
    opportunityId: opp.id,
    symbol: opp.symbol,
    assetClass: opp.assetClass,
    amount: allocation,
    entryPrice: opp.entryPrice,
    quantity: Math.round(quantity * 10000) / 10000,
    stopLossPrice: computeStopLoss(opp.entryPrice, limits),
    openedAt: new Date().toISOString(),
    status: needsApproval ? "PENDING_APPROVAL" : "OPEN",
  };
}
