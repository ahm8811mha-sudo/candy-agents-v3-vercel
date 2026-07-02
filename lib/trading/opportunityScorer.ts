/**
 * Opportunity scoring and ranking.
 *
 * Produces a 0..100 score blending expected return, model confidence, and a
 * risk penalty, then ranks opportunities best-first. Pure functions.
 */

import type { MarketOpportunity } from "./types";

const RISK_WEIGHT: Record<string, number> = {
  LOW: 1,
  MEDIUM: 0.75,
  HIGH: 0.5,
};

export function scoreOpportunity(opp: MarketOpportunity): number {
  const riskWeight = RISK_WEIGHT[opp.risk] ?? 0.5;
  // Reward expected return (capped) and confidence; penalize risk and long horizon.
  const returnComponent = Math.min(opp.expectedReturn, 0.5) / 0.5; // 0..1
  const confidenceComponent = Math.max(0, Math.min(opp.confidence, 1));
  const horizonPenalty = opp.horizonDays > 0 ? Math.min(1, 30 / opp.horizonDays) : 1;

  const raw =
    returnComponent * 0.45 +
    confidenceComponent * 0.35 +
    horizonPenalty * 0.2;

  return Math.round(raw * riskWeight * 100);
}

export function rankOpportunities(opps: MarketOpportunity[]): MarketOpportunity[] {
  return [...opps].sort((a, b) => scoreOpportunity(b) - scoreOpportunity(a));
}
