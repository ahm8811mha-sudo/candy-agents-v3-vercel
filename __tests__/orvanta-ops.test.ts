import { describe, it, expect } from "vitest";
import { decisionAge, STALE_AFTER_HOURS } from "../lib/inbox";
import { normalizeArabic } from "../components/CommandPalette";

describe("decision aging SLA (Amazon-style ops telemetry)", () => {
  const now = new Date("2026-07-08T12:00:00Z");

  it("fresh items are under an hour and not stale", () => {
    const age = decisionAge("2026-07-08T11:40:00Z", now);
    expect(age.hours).toBeLessThan(1);
    expect(age.stale).toBe(false);
    expect(age.label).toContain("أقل من ساعة");
  });

  it("same-day items report hours", () => {
    const age = decisionAge("2026-07-08T04:00:00Z", now);
    expect(age.hours).toBe(8);
    expect(age.stale).toBe(false);
    expect(age.label).toContain("ساعة");
  });

  it(`items past ${STALE_AFTER_HOURS}h are stale and report days`, () => {
    const age = decisionAge("2026-07-05T12:00:00Z", now);
    expect(age.hours).toBe(72);
    expect(age.stale).toBe(true);
    expect(age.label).toContain("يوم");
  });

  it("invalid dates degrade to zero age instead of NaN", () => {
    const age = decisionAge("not-a-date", now);
    expect(age.hours).toBe(0);
    expect(age.stale).toBe(false);
  });
});

describe("command palette Arabic search normalization", () => {
  it("matches across alef/teh-marbuta variants", () => {
    expect(normalizeArabic("الأفكار")).toBe(normalizeArabic("الافكار"));
    expect(normalizeArabic("فكرة")).toBe(normalizeArabic("فكره"));
  });

  it("strips diacritics", () => {
    expect(normalizeArabic("مَرْكَز")).toBe("مركز");
  });
});
