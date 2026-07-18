import { describe, expect, it } from "vitest";
import { evaluateBusiness, extractRequestedBudget } from "./businessBrain";

describe("businessBrain", () => {
  it("extracts Arabic/SAR budget numbers", () => {
    expect(extractRequestedBudget("ميزانية ٥٠,٠٠٠ ريال")).toBe(50000);
  });

  it("does not mistake timelines or counts for a budget", () => {
    expect(extractRequestedBudget("شغّل تجربة لمدة 14 يومًا مع 5 وكلاء")).toBe(0);
  });

  it("supports a written thousands multiplier in financial context", () => {
    expect(extractRequestedBudget("سقف الصرف ١٠ آلاف ريال")).toBe(10000);
  });

  it("attaches confidence, assumptions, and evidence to recommendations", () => {
    const intelligence = evaluateBusiness("إطلاق حملة بميزانية 12000 ريال", {
      income: 50000,
      expenses: 20000,
      profit: 30000,
      transactionCount: 3,
      source: "ledger",
    });

    expect(intelligence.confidence).toBeGreaterThan(0);
    expect(intelligence.assumptions.length).toBeGreaterThan(0);
    expect(intelligence.evidence.length).toBeGreaterThan(0);
    expect(intelligence.recommendedActions.length).toBeGreaterThan(0);
    expect(intelligence.recommendedActions[0].confidence).toBe(intelligence.confidence);
    expect(intelligence.recommendedActions[0].evidence.length).toBeGreaterThan(0);
  });
});
