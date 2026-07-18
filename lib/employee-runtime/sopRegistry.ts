import { EMPLOYEE_SOPS, type EmployeeSop } from "./sops";
import { SUPPORT_EMPLOYEE_SOPS } from "./supportSops";

export const ALL_EMPLOYEE_SOPS: EmployeeSop[] = [
  ...EMPLOYEE_SOPS,
  ...SUPPORT_EMPLOYEE_SOPS,
];

const sopById = new Map(ALL_EMPLOYEE_SOPS.map((sop) => [sop.id, sop]));

export function getEmployeeSop(id: string): EmployeeSop | undefined {
  return sopById.get(id);
}

export function requireEmployeeSop(id: string): EmployeeSop {
  const sop = getEmployeeSop(id);
  if (!sop) throw new Error(`Unknown employee SOP: ${id}`);
  return sop;
}
