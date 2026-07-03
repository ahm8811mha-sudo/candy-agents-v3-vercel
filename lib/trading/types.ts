/**
 * Shared types for the CFO autonomous trading desk.
 *
 * The desk operates on two opportunity sources under a single company:
 *   - BUSINESS  : commerce / inventory / campaign opportunities (ties into
 *                 opportunity-radar + Shopify), and
 *   - MARKET    : financial instruments (EQUITY / CRYPTO / FOREX).
 *
 * Execution defaults to SIMULATION (paper). Real execution is gated and
 * disabled unless explicitly configured by the operator (see executionEngine).
 */

export type AssetClass = "BUSINESS" | "EQUITY" | "CRYPTO" | "FOREX" | "TADAWUL";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type TradingMode = "SIMULATION" | "LIVE";

export type MarketOpportunity = {
  id: string;
  symbol: string; // ticker (e.g. "AAPL") or business opportunity code
  assetClass: AssetClass;
  title: string;
  expectedReturn: number; // fraction, e.g. 0.12 = 12% expected
  risk: RiskLevel;
  confidence: number; // 0..1 model confidence
  entryPrice: number; // price per unit (1 for whole-allocation business bets)
  horizonDays: number;
  source: string;
};

export type RiskLimits = {
  totalBudget: number;
  maxPositionPct: number; // max fraction of budget per single position
  maxAssetClassPct: number; // max fraction of budget per asset class
  stopLossPct: number; // per-position stop-loss distance
  maxDrawdownPct: number; // portfolio-level kill switch
  minConfidence: number; // reject opportunities below this confidence
  minExpectedReturn: number; // reject opportunities below this expected return
  approvalThreshold: number; // allocations at/above this need human approval
};

export type PositionStatus = "OPEN" | "CLOSED" | "PENDING_APPROVAL";

export type Position = {
  id: string;
  opportunityId: string;
  symbol: string;
  assetClass: AssetClass;
  amount: number; // capital allocated
  entryPrice: number;
  quantity: number;
  stopLossPrice: number;
  openedAt: string;
  status: PositionStatus;
};

export type DecisionAction = "BUY" | "SKIP" | "NEEDS_APPROVAL";

export type TradeDecision = {
  opportunity: MarketOpportunity;
  action: DecisionAction;
  allocation: number;
  score: number;
  reason: string;
};

export type Portfolio = {
  mode: TradingMode;
  totalBudget: number;
  cash: number;
  deployed: number;
  positions: Position[];
  realizedPnl: number;
};

export type TradingCycleResult = {
  mode: TradingMode;
  liveRequested: boolean;
  decisions: TradeDecision[];
  portfolio: Portfolio;
  approvalsRequired: number;
  notes: string[];
};
