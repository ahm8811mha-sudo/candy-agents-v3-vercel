import { describe, it, expect } from "vitest";
import { getMarketState, canTradeNow } from "../lib/trading/marketHours";

// Helpers build instants at a known ET wall-clock time. We pick dates in
// standard time (EST = UTC-5) to keep the offset deterministic.
function etWinter(hourET: number, minute: number, day = 6 /* 2024-01-06 is a Sat */): Date {
  // 2024-01-08 is a Monday. Use UTC = ET + 5 in winter.
  return new Date(Date.UTC(2024, 0, day, hourET + 5, minute));
}

describe("marketHours", () => {
  it("is closed on weekends", () => {
    // 2024-01-06 = Saturday, noon ET
    const state = getMarketState(etWinter(12, 0, 6));
    expect(state.isWeekday).toBe(false);
    expect(state.isOpen).toBe(false);
  });

  it("is open at midday on a weekday", () => {
    // 2024-01-08 = Monday, 12:00 ET
    const state = getMarketState(etWinter(12, 0, 8));
    expect(state.isOpen).toBe(true);
    expect(state.minutesToClose).toBe(240); // 16:00 - 12:00
  });

  it("is closed before the open", () => {
    const state = getMarketState(etWinter(9, 0, 8)); // 09:00 ET Monday
    expect(state.isOpen).toBe(false);
  });

  it("flags the flatten window in the last 15 minutes", () => {
    const state = getMarketState(etWinter(15, 50, 8)); // 15:50 ET Monday
    expect(state.isOpen).toBe(true);
    expect(state.minutesToClose).toBe(10);
    expect(state.shouldFlatten).toBe(true);
    expect(canTradeNow(etWinter(15, 50, 8))).toBe(false);
  });

  it("allows trading mid-session", () => {
    expect(canTradeNow(etWinter(11, 0, 8))).toBe(true);
  });
});
