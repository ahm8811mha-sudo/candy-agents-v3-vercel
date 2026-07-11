import { describe, expect, it } from "vitest";
import { IDEA_TO_INVESTMENT_WORKFLOW } from "./workflowRuntime";

const REQUIRED_STEPS = [
  "VALIDATE_INPUT",
  "CLASSIFY_RISK",
  "CREATE_DECISION_PACKET",
  "WAIT_FOR_APPROVAL",
  "RESERVE_BUDGET",
  "CREATE_PROJECT",
  "DISPATCH_ACTIONS",
  "FINALIZE",
];

describe("idea-to-investment workflow", () => {
  it("has a stable versioned id", () => {
    expect(IDEA_TO_INVESTMENT_WORKFLOW.id).toBe("idea-to-investment");
    expect(IDEA_TO_INVESTMENT_WORKFLOW.version).toBe(1);
  });

  it("contains every governance and execution gate in order", () => {
    expect([...IDEA_TO_INVESTMENT_WORKFLOW.steps]).toEqual(REQUIRED_STEPS);
  });

  it("does not allow project creation before approval and budget reservation", () => {
    const steps = [...IDEA_TO_INVESTMENT_WORKFLOW.steps];
    expect(steps.indexOf("WAIT_FOR_APPROVAL")).toBeLessThan(steps.indexOf("RESERVE_BUDGET"));
    expect(steps.indexOf("RESERVE_BUDGET")).toBeLessThan(steps.indexOf("CREATE_PROJECT"));
  });
});
