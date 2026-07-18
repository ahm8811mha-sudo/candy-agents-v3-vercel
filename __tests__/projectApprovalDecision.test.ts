import { describe, it, expect } from "vitest";
import { applyTaskFundingDecision } from "../lib/companyExecutionSystem";

describe("applyTaskFundingDecision (funding sign-off side-effect)", () => {
  it("ignores BUDGET items that are not task-funding gates", async () => {
    expect(await applyTaskFundingDecision(undefined, "APPROVED")).toBeNull();
    expect(await applyTaskFundingDecision({}, "APPROVED")).toBeNull();
    expect(await applyTaskFundingDecision({ kind: "SOMETHING_ELSE", taskId: "t1" }, "APPROVED")).toBeNull();
  });

  it("reports a readable failure when the task id is missing", async () => {
    const result = await applyTaskFundingDecision({ kind: "TASK_FUNDING" }, "APPROVED");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.reason).toContain("taskId");
  });

  it("degrades safely without Supabase instead of pretending to execute", async () => {
    const result = await applyTaskFundingDecision(
      { kind: "TASK_FUNDING", taskId: "task-123" },
      "REJECTED"
    );
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.taskId).toBe("task-123");
    expect(result!.reason).toContain("Supabase");
  });
});
