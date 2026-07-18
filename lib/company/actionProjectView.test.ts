import { describe, expect, it } from "vitest";
import { buildActionProjectGroups } from "./actionProjectView";

describe("buildActionProjectGroups", () => {
  it("creates one independent workfile for every approved project", () => {
    const projects = [
      { id: "approved", status: "RESULTS_READY", approval_status: "APPROVED" },
      { id: "pending", status: "PENDING_APPROVAL", approval_status: "PENDING" },
      { id: "rejected", status: "REJECTED", approval_status: "REJECTED" },
    ];
    const actions = [
      { id: "a1", project_id: "approved", status: "DONE" },
      { id: "a2", project_id: "approved", status: "FAILED" },
      { id: "a3", project_id: "pending", status: "WAITING_APPROVAL" },
      { id: "a4", status: "QUEUED" },
    ];
    const tasks = [
      { id: "t1", project_id: "approved", status: "DONE", progress_percent: 100 },
      { id: "t2", project_id: "approved", status: "TODO", progress_percent: 0 },
    ];

    const result = buildActionProjectGroups(projects, actions, tasks);
    expect(result.approved).toHaveLength(1);
    expect(result.approved[0]).toMatchObject({ progress: 50, doneActions: 1, failedActions: 1, doneTasks: 1 });
    expect(result.pending[0].project.id).toBe("pending");
    expect(result.inactive[0].project.id).toBe("rejected");
    expect(result.unassigned.map((action) => action.id)).toEqual(["a4"]);
  });
});
