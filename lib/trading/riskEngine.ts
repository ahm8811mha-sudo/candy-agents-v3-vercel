/**
 * Risk engine — the safety core of the trading desk.
 *
 * Every allocation passes through here. Pure functions only (no I/O) so the
 * rules are fully unit-testable. None of these functions place trades; they
 * only decide whether and how much capital a trade may use.
 */

import type { MarketOpportunity, RiskLimits, Portfolio } from "./types";

const RISK_PENALTY: Record<string, number> = {
  LOW: 1,
  MEDIUM: 0.7,
  HIGH: 0.45,
};

export function defaultRiskLimits(totalBudget: number): RiskLimits {
  return {
    totalBudget,
    maxPositionPct: 0.15, // no single position over 15% of budget
    maxAssetClassPct: 0.4, // no asset class over 40% of budget
    stopLossPct: 0.08, // exit a position down 8%
    maxDrawdownPct: 0.2, // halt all trading if portfolio down 20%
    minConfidence: 0.55,
    minExpectedReturn: 0.05,
    approvalThreshold: totalBudget * 0.1, // trades >= 10% of budget need sign-off
  };
}

/** Hard go/no-go checks independent of sizing. */
export function passesRiskChecks(
  opp: MarketOpportunity,
  limits: RiskLimits
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (opp.confidence < limits.minConfidence) {
    reasons.push(`الثقة ${(opp.confidence * 100).toFixed(0)}% أقل من الحد ${(limits.minConfidence * 100).toFixed(0)}%`);
  }
  if (opp.expectedReturn < limits.minExpectedReturn) {
    reasons.push(`العائد المتوقع ${(opp.expectedReturn * 100).toFixed(0)}% أقل من الحد ${(limits.minExpectedReturn * 100).toFixed(0)}%`);
  }
  if (opp.entryPrice <= 0) {
    reasons.push("سعر الدخول غير صالح");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Current capital deployed into a given asset class. */
export function exposureByClass(portfolio: Portfolio, assetClass: string): number {
  return portfolio.positions
    .filter((p) => p.assetClass === assetClass && p.status !== "CLOSED")
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Position size respecting: per-position cap, per-asset-class cap, available
 * cash, and a risk-level scaling factor. Returns 0 when no room is available.
 */
export function positionSize(
  opp: MarketOpportunity,
  limits: RiskLimits,
  portfolio: Portfolio
): number {
  const perPositionCap = limits.totalBudget * limits.maxPositionPct;
  const classCap = limits.totalBudget * limits.maxAssetClassPct;
  const classRoom = Math.max(0, classCap - exposureByClass(portfolio, opp.assetClass));
  const riskScale = RISK_PENALTY[opp.risk] ?? 0.5;

  const target = perPositionCap * riskScale * Math.min(1, opp.confidence + 0.25);
  const bounded = Math.min(target, perPositionCap, classRoom, portfolio.cash);
  return Math.max(0, Math.round(bounded));
}

/** Allocations at/above the approval threshold require human sign-off. */
export function requiresApproval(allocation: number, limits: RiskLimits): boolean {
  return allocation >= limits.approvalThreshold;
}

export function computeStopLoss(entryPrice: number, limits: RiskLimits): number {
  return Math.round(entryPrice * (1 - limits.stopLossPct) * 100) / 100;
}

/** Portfolio-level kill switch: true when drawdown exceeds the limit. */
export function drawdownBreached(portfolio: Portfolio, limits: RiskLimits): boolean {
  const equity = portfolio.cash + portfolio.deployed + portfolio.realizedPnl;
  const drawdown = (portfolio.totalBudget - equity) / portfolio.totalBudget;
  return drawdown >= limits.maxDrawdownPct;
}
