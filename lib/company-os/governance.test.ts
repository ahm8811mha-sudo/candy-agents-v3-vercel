import { describe, expect, it } from "vitest";
import { approvalRoute, classifyRisk, mayAutoExecute, validateDecisionSeparation } from "./governance";

describe("company OS governance", () => {
  it("classifies reversible low-cost work as LOW", () => {
    expect(classifyRisk({ commitmentSAR: 3_000 })).toBe("LOW");
    expect(mayAutoExecute("LOW", 3_000)).toBe(true);
  });

  it("raises customer-facing work to MEDIUM", () => {
    expect(classifyRisk({ customerFacing: true, commitmentSAR: 2_000 })).toBe("MEDIUM");
    expect(approvalRoute("MEDIUM")).toEqual(["CEO"]);
  });

  it("raises material and sensitive work to HIGH", () => {
    expect(classifyRisk({ commitmentSAR: 80_000, sensitiveData: true })).toBe("HIGH");
    expect(approvalRoute("HIGH")).toEqual(["CEO", "CFO", "CRO"]);
  });

  it("classifies regulatory, continuity and large commitments as CRITICAL", () => {
    expect(classifyRisk({ regulatoryAction: true })).toBe("CRITICAL");
    expect(classifyRisk({ commitmentSAR: 300_000 })).toBe("CRITICAL");
    expect(approvalRoute("CRITICAL")).toContain("OWNER");
  });

  it("prevents a material recommender from solely approving their own decision", () => {
    expect(validateDecisionSeparation({ recommenderRole: "CEO", approverRoles: ["CEO"], riskLevel: "HIGH" }).valid).toBe(false);
    expect(validateDecisionSeparation({ recommenderRole: "CEO", approverRoles: ["CFO", "CRO"], riskLevel: "HIGH" }).valid).toBe(true);
  });
});
