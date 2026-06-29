/**
 * Daily session risk guard (focusflow limits).
 *
 * Enforces the per-day trading limits independent of any single trade's sizing:
 *   - daily loss limit (default 2% of starting equity → halt for the day)
 *   - max concurrent open positions (default 5)
 *   - max trades per day (default 30)
 *
 * Pure functions over an explicit session state, so every guard is testable.
 */

export type SessionLimits = {
  maxDailyLossPct: number;
  maxOpenPositions: number;
  maxTradesPerDay: number;
};

export const DEFAULT_SESSION_LIMITS: SessionLimits = {
  maxDailyLossPct: 0.02,
  maxOpenPositions: 5,
  maxTradesPerDay: 30,
};

export type SessionState = {
  startingEquity: number;
  currentEquity: number;
  openPositions: number;
  tradesToday: number;
};

export type GuardResult = { allowed: boolean; reason: string };

export function dailyPnlPct(state: SessionState): number {
  if (state.startingEquity <= 0) return 0;
  return (state.currentEquity - state.startingEquity) / state.startingEquity;
}

/** True when the daily loss limit has been hit (trading must halt). */
export function dailyLossLimitHit(state: SessionState, limits: SessionLimits = DEFAULT_SESSION_LIMITS): boolean {
  return dailyPnlPct(state) <= -limits.maxDailyLossPct;
}

export function canOpenNewPosition(
  state: SessionState,
  limits: SessionLimits = DEFAULT_SESSION_LIMITS
): GuardResult {
  if (dailyLossLimitHit(state, limits)) {
    return { allowed: false, reason: `تم بلوغ حد الخسارة اليومي ${(limits.maxDailyLossPct * 100).toFixed(0)}% — إيقاف التداول لليوم` };
  }
  if (state.openPositions >= limits.maxOpenPositions) {
    return { allowed: false, reason: `الحد الأقصى للمراكز المفتوحة (${limits.maxOpenPositions}) تم بلوغه` };
  }
  if (state.tradesToday >= limits.maxTradesPerDay) {
    return { allowed: false, reason: `الحد الأقصى للصفقات اليومية (${limits.maxTradesPerDay}) تم بلوغه` };
  }
  return { allowed: true, reason: "مسموح بفتح مركز جديد" };
}
