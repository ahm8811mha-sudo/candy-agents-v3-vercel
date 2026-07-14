import { describe, it, expect } from "vitest";
import {
  extractRequestedBudget,
  evaluateBusiness,
  buildExecutionBlueprint,
} from "../lib/businessBrain";

describe("extractRequestedBudget", () => {
  it("extracts numeric budget from Arabic text", () => {
    expect(extractRequestedBudget("ميزانية 50000 ريال")).toBe(50000);
  });

  it("extracts largest number", () => {
    expect(extractRequestedBudget("ميزانية بين 10000 و 50000")).toBe(50000);
  });

  it("returns 0 when no number found", () => {
    expect(extractRequestedBudget("أريد إطلاق مشروع")).toBe(0);
  });

  it("handles comma-separated numbers", () => {
    expect(extractRequestedBudget("50,000 ريال")).toBe(50000);
  });

  it("normalizes Arabic digits", () => {
    expect(extractRequestedBudget("ميزانية ٥٠٠٠٠ ريال")).toBe(50000);
  });

  it("normalizes Persian digits", () => {
    expect(extractRequestedBudget("ميزانية ۵۰۰۰۰ ريال")).toBe(50000);
  });
});

describe("evaluateBusiness", () => {
  it("returns healthy score for profitable company", () => {
    const result = evaluateBusiness("مشروع جديد", {
      income: 100000,
      expenses: 40000,
      profit: 60000,
      transactionCount: 10,
    });

    expect(result.healthScore).toBeGreaterThan(60);
    expect(result.riskLevel).toBe("LOW");
    expect(result.profitMargin).toBeCloseTo(0.6);
  });

  it("flags critical alerts for losing company", () => {
    const result = evaluateBusiness("توسع", {
      income: 10000,
      expenses: 20000,
      profit: -10000,
      transactionCount: 5,
    });

    expect(result.riskLevel).toBe("HIGH");
    expect(result.alerts.some((a) => a.severity === "CRITICAL")).toBe(true);
  });

  it("flags high expenses ratio", () => {
    const result = evaluateBusiness("مشروع", {
      income: 100000,
      expenses: 80000,
      profit: 20000,
      transactionCount: 10,
    });

    expect(result.alerts.some((a) => a.title.includes("المصاريف مرتفعة"))).toBe(true);
  });

  it("flags when budget exceeds profit", () => {
    const result = evaluateBusiness("ميزانية 100000 ريال", {
      income: 80000,
      expenses: 30000,
      profit: 50000,
      transactionCount: 5,
    });

    expect(
      result.alerts.some((a) => a.title.includes("الميزانية المطلوبة أعلى من الربح"))
    ).toBe(true);
  });

  it("sets AUTO approval for small budgets", () => {
    const result = evaluateBusiness("مشروع صغير بميزانية 3000", {
      income: 50000,
      expenses: 20000,
      profit: 30000,
      transactionCount: 5,
    });

    expect(result.approval.gate).toBe("AUTO");
  });

  it("sets CEO approval for T1 budgets (authority matrix)", () => {
    const result = evaluateBusiness("مشروع بميزانية 20000", {
      income: 100000,
      expenses: 40000,
      profit: 60000,
      transactionCount: 10,
    });

    expect(result.approval.gate).toBe("CEO");
  });

  it("sets OWNER approval above the CEO tier (authority matrix)", () => {
    const result = evaluateBusiness("مشروع بميزانية 100000", {
      income: 200000,
      expenses: 80000,
      profit: 120000,
      transactionCount: 20,
    });

    expect(result.approval.gate).toBe("OWNER");
  });

  it("escalates a losing company to OWNER/T2", () => {
    const result = evaluateBusiness("مشروع", {
      income: 5000,
      expenses: 10000,
      profit: -5000,
      transactionCount: 3,
    });

    expect(result.approval.gate).toBe("OWNER");
    expect(result.approval.requiredRole).toBe("OWNER");
  });

  it("calculates expense ratio correctly", () => {
    const result = evaluateBusiness("مشروع", {
      income: 100000,
      expenses: 50000,
      profit: 50000,
      transactionCount: 10,
    });

    expect(result.expenseRatio).toBeCloseTo(0.5);
  });

  it("provides recommended actions", () => {
    const result = evaluateBusiness("مشروع جديد", {
      income: 50000,
      expenses: 20000,
      profit: 30000,
      transactionCount: 5,
    });

    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.recommendedActions[0].actionType).toBe("BUDGET_GATE");
  });
});

describe("buildExecutionBlueprint", () => {
  it("generates tasks and KPIs", () => {
    const intelligence = evaluateBusiness("مشروع بميزانية 20000", {
      income: 50000,
      expenses: 20000,
      profit: 30000,
      transactionCount: 5,
    });

    const blueprint = buildExecutionBlueprint("مشروع جديد", intelligence);

    expect(blueprint.tasks.length).toBeGreaterThan(0);
    expect(blueprint.kpis.length).toBeGreaterThan(0);
    expect(blueprint.actions.length).toBeGreaterThan(0);
  });

  it("assigns owner roles to tasks", () => {
    const intelligence = evaluateBusiness("مشروع", {
      income: 100000,
      expenses: 40000,
      profit: 60000,
      transactionCount: 10,
    });

    const blueprint = buildExecutionBlueprint("مشروع", intelligence);
    blueprint.tasks.forEach((task) => {
      expect(task.ownerRole).toBeTruthy();
      expect(task.dueDays).toBeGreaterThan(0);
    });
  });
});
