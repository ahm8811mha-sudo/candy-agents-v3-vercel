import { describe, it, expect } from "vitest";
import { applyProjectApprovalDecision } from "../lib/companyExecutionSystem";

describe("applyProjectApprovalDecision (unified decision side-effect)", () => {
  it("ignores GENERAL items that are not project approvals", async () => {
    expect(await applyProjectApprovalDecision(undefined, "APPROVED")).toBeNull();
    expect(await applyProjectApprovalDecision({}, "APPROVED")).toBeNull();
    expect(
      await applyProjectApprovalDecision({ kind: "SOMETHING_ELSE", projectId: "p1" }, "APPROVED")
    ).toBeNull();
    // governanceOS enterprise items carry source/tier metadata but no kind.
    expect(
      await applyProjectApprovalDecision({ source: "governanceOS", tier: "T2" }, "REJECTED")
    ).toBeNull();
  });

  it("reports a readable failure when the project id is missing", async () => {
    const result = await applyProjectApprovalDecision({ kind: "PROJECT_APPROVAL" }, "APPROVED");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.reason).toContain("projectId");
  });

  it("degrades safely without Supabase instead of pretending to execute", async () => {
    const result = await applyProjectApprovalDecision(
      { kind: "PROJECT_APPROVAL", projectId: "prj-123" },
      "APPROVED"
    );
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.projectId).toBe("prj-123");
    expect(result!.reason).toContain("Supabase");
  });
});
