import { afterEach, describe, expect, it } from "vitest";
import { IDEA_TO_INVESTMENT_WORKFLOW, isWorkflowRuntimeEnabled } from "./workflowRuntime";

const originalPersonalMode = process.env.ORVANTA_PERSONAL_MODE;
const originalRuntime = process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED;

afterEach(() => {
  if (originalPersonalMode === undefined) delete process.env.ORVANTA_PERSONAL_MODE;
  else process.env.ORVANTA_PERSONAL_MODE = originalPersonalMode;
  if (originalRuntime === undefined) delete process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED;
  else process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED = originalRuntime;
});

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

  it("enables the durable runtime by default in private owner mode", () => {
    process.env.ORVANTA_PERSONAL_MODE = "true";
    delete process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED;
    expect(isWorkflowRuntimeEnabled()).toBe(true);
  });

  it("honors an explicit private-owner runtime kill switch", () => {
    process.env.ORVANTA_PERSONAL_MODE = "true";
    process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED = "false";
    expect(isWorkflowRuntimeEnabled()).toBe(false);
  });

  it("requires explicit activation in commercial mode", () => {
    process.env.ORVANTA_PERSONAL_MODE = "false";
    delete process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED;
    expect(isWorkflowRuntimeEnabled()).toBe(false);
  });
});
