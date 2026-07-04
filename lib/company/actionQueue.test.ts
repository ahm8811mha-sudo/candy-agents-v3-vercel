import { describe, expect, it } from "vitest";
import { normalizeActionInitialStatus } from "./actionQueue";

describe("normalizeActionInitialStatus", () => {
  it("waits for approval when approval is required", () => {
    expect(normalizeActionInitialStatus({ requiresApproval: true, executionMode: "INTERNAL", approvalStatus: "PENDING" })).toBe("WAITING_APPROVAL");
  });

  it("waits for integration for external actions after approval is satisfied", () => {
    expect(normalizeActionInitialStatus({ requiresApproval: false, executionMode: "READY_FOR_INTEGRATION", approvalStatus: "APPROVED" })).toBe("WAITING_INTEGRATION");
  });

  it("queues internal actions that need no approval", () => {
    expect(normalizeActionInitialStatus({ requiresApproval: false, executionMode: "INTERNAL", approvalStatus: "NOT_REQUIRED" })).toBe("QUEUED");
  });
});
