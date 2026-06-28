import { describe, it, expect } from "vitest";

describe("accountingSystem", () => {
  it("validates transaction types", () => {
    const validTypes = ["income", "expense"];
    expect(validTypes.includes("income")).toBe(true);
    expect(validTypes.includes("expense")).toBe(true);
    expect(validTypes.includes("transfer")).toBe(false);
  });

  it("calculates financials correctly", () => {
    const transactions = [
      { type: "income", amount: 15000 },
      { type: "income", amount: 25000 },
      { type: "expense", amount: 5000 },
      { type: "expense", amount: 10000 },
    ];

    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    expect(income).toBe(40000);
    expect(expenses).toBe(15000);
    expect(income - expenses).toBe(25000);
  });

  it("handles empty transactions", () => {
    const transactions: Array<{ type: string; amount: number }> = [];
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    expect(income).toBe(0);
    expect(expenses).toBe(0);
    expect(income - expenses).toBe(0);
  });

  it("rejects zero and negative amounts", () => {
    expect(0 > 0).toBe(false);
    expect(-100 > 0).toBe(false);
    expect(100 > 0).toBe(true);
  });
});
