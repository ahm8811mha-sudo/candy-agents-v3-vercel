/**
 * Execute an approved trade.
 *
 * When a TRADE approval is approved by a human, this routes it to Alpaca (paper
 * by default). Only tradable asset classes (EQUITY / CRYPTO) reach the broker;
 * BUSINESS and FOREX opportunities are recorded as simulated approvals. If
 * Alpaca is not configured, the approval still succeeds as a simulation.
 */

import { isAlpacaConfigured, submitBracketOrder, alpacaMode } from "./brokers/alpaca";
import { submitSaudiOrder, saudiBrokerName } from "./brokers/saudiBroker";

export type TradeApprovalMeta = {
  symbol?: string;
  assetClass?: string;
  allocation?: number;
  entryPrice?: number;
  expectedReturn?: number;
};

export type ExecutionResult = {
  executed: boolean;
  simulated: boolean;
  reason: string;
  orderId?: string;
  mode?: string;
  symbol?: string;
  qty?: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function executeApprovedTrade(meta: TradeApprovalMeta): Promise<ExecutionResult> {
  const assetClass = (meta.assetClass || "").toUpperCase();

  const entryEarly = Number(meta.entryPrice) || 0;
  const allocationEarly = Number(meta.allocation) || 0;

  // Saudi market (Tadawul) routes through the configurable Saudi broker adapter.
  if (assetClass === "TADAWUL") {
    if (entryEarly <= 0 || allocationEarly <= 0) {
      return { executed: false, simulated: true, reason: "بيانات السعر/التخصيص غير صالحة — اعتماد محاكاة فقط" };
    }
    const qty = Math.max(1, Math.floor(allocationEarly / entryEarly));
    const result = await submitSaudiOrder({ symbol: String(meta.symbol || ""), qty, side: "buy" });
    return {
      executed: result.submitted,
      simulated: result.simulated,
      reason: result.submitted ? `${result.reason} (${saudiBrokerName()})` : result.reason,
      orderId: result.orderId,
      symbol: String(meta.symbol || ""),
      qty,
    };
  }

  const tradable = assetClass === "EQUITY" || assetClass === "CRYPTO";

  if (!tradable) {
    return { executed: false, simulated: true, reason: "الأصل غير قابل للتداول على Alpaca (فرصة تجارية/فوركس) — اعتماد محاكاة فقط" };
  }
  if (!isAlpacaConfigured()) {
    return { executed: false, simulated: true, reason: "Alpaca غير مُهيّأ — تم الاعتماد كمحاكاة فقط" };
  }

  const entry = Number(meta.entryPrice) || 0;
  const allocation = Number(meta.allocation) || 0;
  if (entry <= 0 || allocation <= 0) {
    return { executed: false, simulated: true, reason: "بيانات السعر/التخصيص غير صالحة — اعتماد محاكاة فقط" };
  }

  let symbol = String(meta.symbol || "");
  if (assetClass === "CRYPTO" && !symbol.includes("/")) symbol = `${symbol}/USD`;

  const qty = Math.max(1, Math.floor(allocation / entry));
  const expectedReturn = Number(meta.expectedReturn) || 0.02;

  // Equities use a bracket order (entry + TP + SL). Crypto on Alpaca does not
  // support bracket orders, so it is submitted as a plain market order.
  const order =
    assetClass === "EQUITY"
      ? {
          symbol,
          qty,
          side: "buy" as const,
          takeProfit: round2(entry * (1 + Math.max(0.01, expectedReturn))),
          stopLoss: round2(entry * (1 - Math.max(0.01, expectedReturn * 0.5))),
        }
      : { symbol, qty, side: "buy" as const };

  try {
    const res = await submitBracketOrder(order);
    return {
      executed: true,
      simulated: alpacaMode() !== "live",
      reason: `تم إرسال أمر شراء ${qty} من ${symbol} إلى Alpaca (${alpacaMode() === "live" ? "حقيقي" : "ورقي"})`,
      orderId: res.id,
      mode: res.mode,
      symbol,
      qty,
    };
  } catch (e) {
    return { executed: false, simulated: false, reason: e instanceof Error ? e.message : "فشل إرسال الأمر لـ Alpaca" };
  }
}
