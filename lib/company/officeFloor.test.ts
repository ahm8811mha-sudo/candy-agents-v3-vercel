import { describe, expect, it } from "vitest";
import { buildOfficeFloor } from "./officeFloor";
import { COMPANY_AGENTS } from "./agents";

describe("office floor", () => {
  it("shows every real employee and marks people with no open work as idle (no invented activity)", () => {
    const floor = buildOfficeFloor({ tasks: [], tasksAvailable: true });
    expect(floor.employees.map((e) => e.id)).toEqual(COMPANY_AGENTS.map((a) => a.id));
    const rased = floor.employees.find((e) => e.id === "rased")!;
    expect(rased.queue).toHaveLength(0);
    expect(["idle", "working"]).toContain(rased.status);
  });
  it("puts an assigned in-progress task in front of its employee", () => {
    const floor = buildOfficeFloor({ tasks: [{ id: "t1", title: "جرد المخزون", status: "IN_PROGRESS", assigned_to: "fahad" }], tasksAvailable: true });
    const fahad = floor.employees.find((e) => e.id === "fahad")!;
    expect(fahad.status).toBe("working");
    expect(fahad.current?.title).toBe("جرد المخزون");
    expect(floor.counters.inProgress).toBe(1);
  });
});
