// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  createAutonomousPlan,
  createExecutiveNarrative,
  generateRecommendations,
  runSimulation,
  type CompanySnapshot,
} from "@/lib/company-intelligence/engine";

const snapshot: CompanySnapshot = {
  tenantId: "golden-star",
  generatedAt: "2026-07-14T00:00:00.000Z",
  metrics: {
    openDecisions: 7,
    activeWorkflows: 4,
    failedIntegrations: 2,
    openCriticalAlerts: 1,
    governmentDocuments: 3,
    postedJournalEntries: 10,
  },
  risks: [
    {
      code: "CRITICAL_ALERTS_OPEN",
      title: "Critical alerts",
      detail: "One critical alert",
      severity: "HIGH",
      confidence: 0.98,
      evidence: { openCriticalAlerts: 1 },
    },
    {
      code: "INTEGRATION_FAILURES",
      title: "Integration failures",
      detail: "Two failures",
      severity: "HIGH",
      confidence: 0.97,
      evidence: { failedIntegrations: 2 },
    },
  ],
  opportunities: [],
  freshness: { decisions: "2026-07-14T00:00:00.000Z" },
};

describe("company intelligence engine", () => {
  it("simulates a business scenario with break-even and cash impact", () => {
    const result = runSimulation({
      name: "Jeddah branch",
      scenarioType: "BRANCH_EXPANSION",
      baseline: {
        monthlyRevenue: 200_000,
        monthlyPayroll: 80_000,
        monthlyOperatingExpenses: 60_000,
        cashBalance: 500_000,
      },
      assumptions: {
        revenueGrowthPct: 10,
        salaryChangePct: 5,
        operatingExpenseChangePct: 8,
        fixedInvestment: 180_000,
        addedMonthlyRevenue: 30_000,
        horizonMonths: 12,
      },
    });

    expect(result.projectedMonthlyRevenue).toBeCloseTo(250_000, 2);
    expect(result.projectedMonthlyPayroll).toBeCloseTo(84_000, 2);
    expect(result.projectedMonthlyOperatingExpenses).toBeCloseTo(64_800, 2);
    expect(result.projectedMonthlyProfit).toBeCloseTo(101_200, 2);
    expect(result.profitDelta).toBeCloseTo(41_200, 2);
    expect(result.breakEvenMonths).toBe(5);
    expect(result.cashImpactAtHorizon).toBeCloseTo(314_400, 2);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("creates an approval-gated autonomous plan", () => {
    const plan = createAutonomousPlan({
      goal: "فتح فرع جديد في جدة",
      horizonDays: 120,
      budgetLimit: 600_000,
      owner: "مدير العمليات",
    });

    expect(plan.phases).toHaveLength(4);
    expect(plan.approvalRequired).toBe(true);
    expect(plan.timeline.horizonDays).toBe(120);
    expect(plan.budget.allocation.execution).toBe(360_000);
    expect(plan.kpis.some((item) => item.name === "نسبة إنجاز الخطة")).toBe(true);
    expect(plan.phases.every((phase) => phase.tasks.length >= 2)).toBe(true);
  });

  it("prioritizes operational stabilization and integration recovery", () => {
    const recommendations = generateRecommendations(snapshot);
    expect(recommendations[0].type).toBe("OPERATIONAL_STABILIZATION");
    expect(recommendations.some((item) => item.type === "INTEGRATION_RECOVERY")).toBe(true);
    expect(recommendations.some((item) => item.type === "DECISION_BACKLOG")).toBe(true);
  });

  it("explains why the business state matters", () => {
    const recommendations = generateRecommendations(snapshot);
    const narrative = createExecutiveNarrative(snapshot, recommendations);
    expect(narrative.headline).toMatch(/استقرار التشغيل/);
    expect(narrative.narrative).toContain("7 قرار");
    expect(narrative.recommendedActions.length).toBeGreaterThan(0);
    expect(narrative.confidence).toBeGreaterThanOrEqual(0.55);
  });
});
