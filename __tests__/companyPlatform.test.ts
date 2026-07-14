import { describe, expect, it } from "vitest";
import {
  buildDigitalTwin,
  predictCompanyRisks,
} from "@/lib/company-intelligence/platform";
import type { CompanySnapshot } from "@/lib/company-intelligence/engine";

function snapshot(overrides: Partial<CompanySnapshot["metrics"]> = {}): CompanySnapshot {
  return {
    tenantId: "golden-star",
    generatedAt: "2026-07-14T00:00:00.000Z",
    metrics: {
      openDecisions: 1,
      activeWorkflows: 3,
      failedIntegrations: 0,
      openCriticalAlerts: 0,
      governmentDocuments: 4,
      postedJournalEntries: 24,
      ...overrides,
    },
    risks: [],
    opportunities: [],
    freshness: {
      decisions: "2026-07-14T00:00:00.000Z",
      workflows: "2026-07-14T00:00:00.000Z",
      integrations: "2026-07-14T00:00:00.000Z",
      alerts: "2026-07-14T00:00:00.000Z",
      government: "2026-07-14T00:00:00.000Z",
      accounting: "2026-07-14T00:00:00.000Z",
    },
  };
}

describe("company intelligence platform", () => {
  it("builds a bounded digital twin with healthy domain scores", () => {
    const twin = buildDigitalTwin(snapshot());
    expect(twin.healthScore).toBeGreaterThanOrEqual(70);
    expect(twin.healthScore).toBeLessThanOrEqual(100);
    expect(twin.maturityScore).toBeGreaterThan(40);
    expect(twin.domains.finance.status).toBe("HEALTHY");
    expect(twin.capacity.activeWorkflows).toBe(3);
  });

  it("reduces the twin score when critical operational signals rise", () => {
    const healthy = buildDigitalTwin(snapshot());
    const stressed = buildDigitalTwin(snapshot({ openCriticalAlerts: 3, failedIntegrations: 6, openDecisions: 9 }));
    expect(stressed.healthScore).toBeLessThan(healthy.healthScore);
    expect(stressed.domains.reliability.status).toBe("CRITICAL");
    expect(stressed.domains.decisions.score).toBeLessThan(healthy.domains.decisions.score);
  });

  it("produces evidence-based predictions with confidence and limitations", () => {
    const source = snapshot({ openCriticalAlerts: 2, failedIntegrations: 4, openDecisions: 8 });
    const predictions = predictCompanyRisks(source, buildDigitalTwin(source));
    const operational = predictions.find((item) => item.predictionType === "OPERATIONAL_DISRUPTION");
    expect(operational).toBeDefined();
    expect(operational?.probability).toBeGreaterThan(0.5);
    expect(operational?.confidence).toBeGreaterThan(0);
    expect(operational?.dataQuality).toBeGreaterThan(0);
    expect(operational?.evidence.length).toBeGreaterThan(0);
    expect(operational?.limitations.length).toBeGreaterThan(0);
  });

  it("flags the financial blind spot when no journal data exists", () => {
    const source = snapshot({ postedJournalEntries: 0 });
    const prediction = predictCompanyRisks(source, buildDigitalTwin(source)).find(
      (item) => item.predictionType === "FINANCIAL_DECISION_BLIND_SPOT"
    );
    expect(prediction?.probability).toBe(0.95);
    expect(prediction?.prediction.likely).toBe(true);
  });
});
