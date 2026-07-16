import { describe, expect, it } from "vitest";
import { createProjectNumber, createWorkOrderNumber } from "./engine";
import { employeeHasCapability, resolveActiveEmployee } from "./registry";

describe("Employee Runtime V1", () => {
  it("creates stable linked project and work-order numbers", () => {
    const project = createProjectNumber("tenant:ORDER-150", new Date("2026-07-17T00:00:00Z"));
    expect(project).toMatch(/^PRJ-2026-[A-F0-9]{6}$/);
    expect(createWorkOrderNumber(project, 5)).toBe(`${project}/005`);
  });

  it("enforces employee capabilities", () => {
    expect(employeeHasCapability("sara", "RECORD_SALE")).toBe(true);
    expect(employeeHasCapability("sara", "CREATE_SALES_INVOICE")).toBe(false);
  });

  it("routes work to the configured backup employee", () => {
    expect(resolveActiveEmployee("sara", ["sara"]).id).toBe("noura");
  });
});
