/**
 * Saudi market (Tadawul) module.
 *
 * IMPORTANT: real order execution on Tadawul is only possible through a
 * CMA-licensed broker. There is no direct/public trading access. This module
 * therefore provides market metadata, trading-hours logic, and SIMULATED
 * opportunities so the CFO desk can analyse and paper-trade Saudi equities. Real
 * execution is routed through the configurable Saudi broker adapter when (and
 * only when) a licensed broker API is connected.
 */

import type { MarketOpportunity } from "../types";

export type TadawulSymbol = { code: string; name: string; sector: string; refPrice: number };

/** Major Tadawul constituents (codes are the official 4-digit symbols). */
export const TADAWUL_SYMBOLS: TadawulSymbol[] = [
  { code: "2222", name: "أرامكو السعودية", sector: "الطاقة", refPrice: 28.5 },
  { code: "1120", name: "مصرف الراجحي", sector: "البنوك", refPrice: 92 },
  { code: "2010", name: "سابك", sector: "المواد الأساسية", refPrice: 72 },
  { code: "7010", name: "STC", sector: "الاتصالات", refPrice: 41 },
  { code: "1180", name: "الأهلي السعودي", sector: "البنوك", refPrice: 35 },
  { code: "2350", name: "كيان السعودية", sector: "المواد الأساسية", refPrice: 14 },
  { code: "4030", name: "البحري", sector: "النقل", refPrice: 31 },
];

const OPEN_MINUTES = 10 * 60; // 10:00 AST
const CLOSE_MINUTES = 15 * 60; // 15:00 AST
const FLATTEN_WINDOW = 15;

export type TadawulMarketState = {
  isTradingDay: boolean; // Sun–Thu
  isOpen: boolean;
  minutesToClose: number;
  shouldFlatten: boolean;
};

/** Riyadh is UTC+3 year-round (no DST). */
function riyadhParts(now: Date): { weekday: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[lookup("weekday")] ?? 0;
  let hour = parseInt(lookup("hour"), 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(lookup("minute"), 10);
  return { weekday, minutes: hour * 60 + minute };
}

export function getTadawulMarketState(now: Date = new Date()): TadawulMarketState {
  const { weekday, minutes } = riyadhParts(now);
  const isTradingDay = weekday >= 0 && weekday <= 4; // Sunday..Thursday
  const isOpen = isTradingDay && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
  const minutesToClose = isOpen ? CLOSE_MINUTES - minutes : 0;
  return {
    isTradingDay,
    isOpen,
    minutesToClose,
    shouldFlatten: isOpen && minutesToClose <= FLATTEN_WINDOW,
  };
}

/** Simulated Saudi-market opportunities for the desk (paper). */
export function sampleTadawulOpportunities(): MarketOpportunity[] {
  return [
    { id: "tdwl-2222", symbol: "2222", assetClass: "TADAWUL", title: "أرامكو 2222 — استقرار وتوزيعات", expectedReturn: 0.07, risk: "LOW", confidence: 0.7, entryPrice: 28.5, horizonDays: 30, source: "tadawul-scan" },
    { id: "tdwl-1120", symbol: "1120", assetClass: "TADAWUL", title: "الراجحي 1120 — زخم قطاع البنوك", expectedReturn: 0.12, risk: "MEDIUM", confidence: 0.68, entryPrice: 92, horizonDays: 21, source: "tadawul-scan" },
    { id: "tdwl-2010", symbol: "2010", assetClass: "TADAWUL", title: "سابك 2010 — انتعاش البتروكيماويات", expectedReturn: 0.15, risk: "MEDIUM", confidence: 0.6, entryPrice: 72, horizonDays: 30, source: "tadawul-scan" },
  ];
}
