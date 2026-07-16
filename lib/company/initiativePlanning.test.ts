import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../aiStructured", () => ({
  runAgentStructured: vi.fn(async () => ({
    ok: false,
    demo: true,
    data: null,
    raw: "",
    error: "not configured",
    provider: "demo",
    model: "demo",
  })),
}));

import { buildInitiativeBlueprint, buildInitiativePlan } from "./initiativePlanning";

describe("initiative planning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the complete Amazon study even when an AI provider is unavailable", async () => {
    const plan = await buildInitiativePlan("ادرس عرض منتجات المصانع عبر Amazon بعمولة من المبيعات");
    expect(plan.kind).toBe("AMAZON_COMMERCE");
    expect(plan.specialistPlans.map((item) => item.role)).toEqual(["MARKET", "FINANCE", "OPERATIONS", "PROCUREMENT", "RISK"]);
    expect(plan.options).toHaveLength(3);
    expect(plan.productCandidates).toHaveLength(5);
    expect(plan.durationDays).toBe(14);
    expect(plan.plannedBudget).toBe(5000);
    expect(plan.finalRecommendation).toContain("بلا مخزون");
  });

  it("creates durable tasks and exactly one executable action per specialist", async () => {
    const plan = await buildInitiativePlan("Amazon factories", { requestedBudget: 7000 });
    const blueprint = buildInitiativeBlueprint(plan, true);
    expect(blueprint.actions).toHaveLength(5);
    expect(blueprint.actions.every((action) => action.actionType === "AGENT_DELIVERABLE" && action.status === "WAITING_APPROVAL")).toBe(true);
    expect(blueprint.tasks.length).toBeGreaterThanOrEqual(10);
    expect(blueprint.tasks.every((task) => task.status === "BLOCKED" && task.metadata.executionAgent)).toBe(true);
  });
});
