import { describe, expect, it } from "vitest";
import {
  createProjectNumber,
  createWorkOrderNumber,
  resolveEmployeeRuntimeMode,
} from "./runtime";
import {
  canExecuteCapability,
  employeeHasCapability,
  resolveActiveEmployee,
} from "./registry";

describe("Employee Runtime V2", () => {
  it("creates stable linked project and work-order numbers", () => {
    const project = createProjectNumber(
      "tenant:ORDER-150",
      new Date("2026-07-17T00:00:00Z")
    );
    expect(project).toMatch(/^PRJ-2026-[A-F0-9]{6}$/);
    expect(createWorkOrderNumber(project, 5)).toBe(`${project}/005`);
  });

  it("enforces permanent employee capabilities", () => {
    expect(employeeHasCapability("sara", "RECORD_SALE")).toBe(true);
    expect(employeeHasCapability("sara", "CREATE_SALES_INVOICE")).toBe(
      false
    );
  });

  it("routes work to the configured backup employee", () => {
    expect(resolveActiveEmployee("sara", ["sara"]).id).toBe("noura");
  });

  it("allows one-step capability delegation only to the configured backup", () => {
    expect(
      canExecuteCapability({
        activeEmployeeId: "noura",
        capability: "RECORD_SALE",
        delegatedFromEmployeeId: "sara",
      })
    ).toBe(true);
    expect(
      canExecuteCapability({
        activeEmployeeId: "fahad",
        capability: "RECORD_SALE",
        delegatedFromEmployeeId: "sara",
      })
    ).toBe(false);
  });

  it("defaults to simulation unless live mode is explicitly enabled", () => {
    const previous = process.env.EMPLOYEE_RUNTIME_MODE;
    process.env.EMPLOYEE_RUNTIME_MODE = "simulation";
    expect(resolveEmployeeRuntimeMode()).toBe("SIMULATION");
    process.env.EMPLOYEE_RUNTIME_MODE = previous;
  });
});
