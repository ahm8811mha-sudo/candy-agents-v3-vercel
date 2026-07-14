/**
 * Execution engine.
 *
 * SIMULATION (paper) is the default and only fully-implemented path: it creates
 * positions against virtual cash, applying the computed stop-loss.
 *
 * The cycle itself computes positions and approval requests; approved tradable
 * orders are routed later through the Alpaca adapter. LIVE therefore requires
 * the same complete opt-in used by the broker adapter.
 */

import type {
  MarketOpportunity,
  Position,
  RiskLimits,
  TradingMode,
} from "./types";
import { computeStopLoss } from "./riskEngine";
import { isAlpacaLiveEnabled } from "./brokers/alpaca";

/**
 * Live trading is enabled only after credentials and all explicit opt-in gates
 * are present. Paper remains the immutable default.
 */
export function isLiveTradingEnabled(): boolean {
  return isAlpacaLiveEnabled();
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
