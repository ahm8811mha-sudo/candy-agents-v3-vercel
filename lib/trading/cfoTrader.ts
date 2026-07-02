/**
 * CFO autonomous trading orchestrator.
 *
 * Given a budget, a set of opportunities, and risk limits, the CFO agent:
 *   1. resolves the execution mode (live downgrades to simulation unless enabled),
 *   2. ranks opportunities by score,
 *   3. runs each through the risk engine (go/no-go + sizing),
 *   4. gates large allocations behind human approval, and
 *   5. opens (paper) positions against virtual cash.
 *
 * A portfolio-level drawdown breach halts further buying immediately.
 */

import type {
  MarketOpportunity,
  Portfolio,
  RiskLimits,
  TradeDecision,
  TradingCycleResult,
  TradingMode,
} from "./types";
import { defaultRiskLimits, passesRiskChecks, positionSize, requiresApproval, drawdownBreached } from "./riskEngine";
import { rankOpportunities, scoreOpportunity } from "./opportunityScorer";
import { openPosition, resolveMode } from "./executionEngine";
import { sampleTadawulOpportunities } from "./markets/tadawul";

export type RunCycleInput = {
  budget: number;
  opportunities: MarketOpportunity[];
  limits?: RiskLimits;
  requestedMode?: TradingMode;
  existingPortfolio?: Portfolio;
};

function emptyPortfolio(budget: number, mode: TradingMode): Portfolio {
  return {
    mode,
    totalBudget: budget,
    cash: budget,
    deployed: 0,
    positions: [],
    realizedPnl: 0,
  };
}

export function runCfoTradingCycle(input: RunCycleInput): TradingCycleResult {
  const { budget, opportunities } = input;
  const requestedMode = input.requestedMode || "SIMULATION";
  const limits = input.limits || defaultRiskLimits(budget);

  const { mode, downgraded } = resolveMode(requestedMode);
  const notes: string[] = [];
  if (downgraded) {
    notes.push("طُلب تنفيذ حقيقي لكنه غير مُفعّل — تم التحويل إلى وضع المحاكاة تلقائياً (ضابط أمان).");
  }

  const portfolio: Portfolio = input.existingPortfolio
    ? { ...input.existingPortfolio, mode }
    : emptyPortfolio(budget, mode);

  const decisions: TradeDecision[] = [];
  let approvalsRequired = 0;

  for (const opp of rankOpportunities(opportunities)) {
    const score = scoreOpportunity(opp);

    if (drawdownBreached(portfolio, limits)) {
      decisions.push({ opportunity: opp, action: "SKIP", allocation: 0, score, reason: "تم تجاوز حد التراجع — إيقاف التداول" });
      continue;
    }

    const checks = passesRiskChecks(opp, limits);
    if (!checks.ok) {
      decisions.push({ opportunity: opp, action: "SKIP", allocation: 0, score, reason: checks.reasons.join("، ") });
      continue;
    }

    const allocation = positionSize(opp, limits, portfolio);
    if (allocation <= 0) {
      decisions.push({ opportunity: opp, action: "SKIP", allocation: 0, score, reason: "لا توجد سيولة/مساحة كافية ضمن الحدود" });
      continue;
    }

    const needsApproval = requiresApproval(allocation, limits);
    const position = openPosition(opp, allocation, limits, mode, needsApproval);
    portfolio.positions.push(position);

    if (needsApproval) {
      approvalsRequired += 1;
      // Reserve the cash but mark as pending until approved.
      portfolio.cash -= allocation;
      portfolio.deployed += allocation;
      decisions.push({ opportunity: opp, action: "NEEDS_APPROVAL", allocation, score, reason: `التخصيص ${allocation} يتجاوز حد الموافقة — بانتظار اعتماد بشري` });
    } else {
      portfolio.cash -= allocation;
      portfolio.deployed += allocation;
      decisions.push({ opportunity: opp, action: "BUY", allocation, score, reason: `تنفيذ ${mode === "SIMULATION" ? "محاكاة" : "حقيقي"} بتخصيص ${allocation}` });
    }
  }

  if (decisions.every((d) => d.action === "SKIP")) {
    notes.push("لم تُستوفَ شروط أي فرصة في هذه الدورة.");
  }

  return {
    mode,
    liveRequested: requestedMode === "LIVE",
    decisions,
    portfolio,
    approvalsRequired,
    notes,
  };
}

/**
 * Representative opportunity feed for simulation/preview. Mixes BUSINESS and
 * MARKET (EQUITY/CRYPTO/FOREX) so the unified desk can be exercised end-to-end
 * without external data sources.
 */
export function sampleOpportunities(): MarketOpportunity[] {
  return [
    { id: "opp-eq-1", symbol: "AAPL", assetClass: "EQUITY", title: "سهم Apple — زخم إيجابي", expectedReturn: 0.09, risk: "LOW", confidence: 0.72, entryPrice: 195, horizonDays: 30, source: "market-scan" },
    { id: "opp-cr-1", symbol: "BTC", assetClass: "CRYPTO", title: "بيتكوين — اختراق مقاومة", expectedReturn: 0.22, risk: "HIGH", confidence: 0.6, entryPrice: 64000, horizonDays: 14, source: "market-scan" },
    { id: "opp-fx-1", symbol: "EUR/USD", assetClass: "FOREX", title: "يورو/دولار — نطاق سعري", expectedReturn: 0.04, risk: "MEDIUM", confidence: 0.5, entryPrice: 1.08, horizonDays: 7, source: "market-scan" },
    { id: "opp-bz-1", symbol: "INV-RESTOCK", assetClass: "BUSINESS", title: "إعادة تخزين منتج عالي الطلب", expectedReturn: 0.18, risk: "MEDIUM", confidence: 0.78, entryPrice: 1, horizonDays: 21, source: "opportunity-radar" },
    { id: "opp-bz-2", symbol: "AD-CAMPAIGN", assetClass: "BUSINESS", title: "حملة تسويقية بعائد مرتفع", expectedReturn: 0.31, risk: "HIGH", confidence: 0.66, entryPrice: 1, horizonDays: 30, source: "opportunity-radar" },
    ...sampleTadawulOpportunities(),
  ];
}
