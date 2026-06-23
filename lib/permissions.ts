import { Role } from "./types";

const permissionMap: Record<Role, string[]> = {
  CEO: ["view_all", "manage_all", "approve_all", "view_reports", "export_data"],
  MANAGER: ["view_team", "assign_tasks", "approve_team", "view_team_reports"],
  EMPLOYEE: ["view_own_tasks", "submit_logs", "update_own_tasks"],
  ADMIN: ["manage_users", "manage_settings", "view_logs", "export_data"],
};

export function can(role: Role, permission: string) {
  return permissionMap[role]?.includes(permission) ?? false;
}
