import { describe, it, expect } from "vitest";
import { pickNewSignal, normalizeIdeaTitle } from "../lib/company/ideas";
import type { OperatingSignal } from "../lib/company/ideaAssessment";

const sig = (key: string, title: string) => ({ key, title, hypothesis: "h", budgetSAR: 1000, horizonDays: 14, evidence: "e", source: "s" }) as unknown as OperatingSignal;
const idea = (title: string, generationKey?: string, createdAt = "2026-01-01T00:00:00Z") => ({ title, createdAt, aggregate: { generationKey, verdict: "CONDITIONAL" as const, confidence: 0, summary: "" } });

describe("daily idea dedupe", () => {
  it("normalizes case, punctuation, diacritics and Arabic letter variants", () => {
    expect(normalizeIdeaTitle("  إعادة طلب: المخزونُ!! ")).toBe(normalizeIdeaTitle("اعادة طلب المخزون"));
    expect(normalizeIdeaTitle("فكرة: Restock X")).toBe(normalizeIdeaTitle("restock   x"));
  });
  it("skips signals already proposed even if older than 30 days (old rotation bug)", () => {
    const r = pickNewSignal([sig("inventory:1", "A")], [idea("A", "inventory:1", "2026-07-01T00:00:00Z")]);
    expect(r.signal).toBeUndefined();
    expect(r.skipped[0].reason).toBe("DUPLICATE_KEY");
  });
  it("skips a signal whose normalized title matches an existing idea under a different key", () => {
    const r = pickNewSignal([sig("inventory:2", "Restock  Widget!")], [idea("restock widget", "inventory:1")]);
    expect(r.signal).toBeUndefined();
    expect(r.skipped[0].reason).toBe("DUPLICATE_TITLE");
  });
  it("never proposes an idea duplicating an already-open spend request", () => {
    const r = pickNewSignal([sig("k", "Buy stock")], [], ["فكرة: Buy Stock"]);
    expect(r.signal).toBeUndefined();
  });
  it("returns the first genuinely new signal and logs skipped ones", () => {
    const r = pickNewSignal([sig("k1", "Old"), sig("k2", "New")], [idea("Old", "k1")]);
    expect(r.signal?.key).toBe("k2");
    expect(r.skipped).toHaveLength(1);
  });
});
