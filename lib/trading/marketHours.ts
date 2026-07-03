/**
 * US equities market-hours helpers (Alpaca regular session: 09:30–16:00 ET).
 *
 * Uses Intl with the America/New_York time zone so DST is handled correctly
 * without a date library. Note: regular holidays are not modeled here — that
 * would require a holiday calendar (a documented limitation).
 */

export type MarketState = {
  isWeekday: boolean;
  isOpen: boolean;
  minutesToClose: number; // 0 when closed
  minutesSinceOpen: number; // 0 when closed
  shouldFlatten: boolean; // within the pre-close flatten window
};

const OPEN_MINUTES = 9 * 60 + 30; // 09:30 ET
const CLOSE_MINUTES = 16 * 60; // 16:00 ET
const FLATTEN_WINDOW = 15; // minutes before close to flatten

/** Extract ET weekday (0=Sun) and minutes-since-midnight for a given instant. */
function easternParts(now: Date): { weekday: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[lookup("weekday")] ?? 1;
  let hour = parseInt(lookup("hour"), 10);
  if (hour === 24) hour = 0; // hour12:false can emit 24 at midnight
  const minute = parseInt(lookup("minute"), 10);
  return { weekday, minutes: hour * 60 + minute };
}

export function getMarketState(now: Date = new Date()): MarketState {
  const { weekday, minutes } = easternParts(now);
  const isWeekday = weekday >= 1 && weekday <= 5;
  const isOpen = isWeekday && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;

  const minutesToClose = isOpen ? CLOSE_MINUTES - minutes : 0;
  const minutesSinceOpen = isOpen ? minutes - OPEN_MINUTES : 0;
  const shouldFlatten = isOpen && minutesToClose <= FLATTEN_WINDOW;

  return { isWeekday, isOpen, minutesToClose, minutesSinceOpen, shouldFlatten };
}

/** Whether the bot may open new positions right now. */
export function canTradeNow(now: Date = new Date()): boolean {
  const state = getMarketState(now);
  return state.isOpen && !state.shouldFlatten;
}
