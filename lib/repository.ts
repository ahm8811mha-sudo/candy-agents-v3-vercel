import { z } from "zod";
import { approvals, dailyLogs, departments, employees, notifications, tasks, activityLogs } from "./mock-data";
import { logActivity } from "./logger";
import { getSupabaseAdmin } from "./supabase";
import { TaskPriority, TaskStatus } from "./types";

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  assignedTo: z.string(),
  createdBy: z.string().default("e-ceo"),
  departmentId: z.string(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().optional(),
});

const logSchema = z.object({
  employeeId: z.string(),
  summary: z.string().min(2),
  blockers: z.string().optional(),
  progressScore: z.number().min(1).max(10).default(7),
});

export async function listEmployees() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return employees;
  const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row: any) => ({ id: row.id, fullName: row.full_name, email: row.email, phone: row.phone, role: row.role, departmentId: row.department_id, managerId: row.manager_id, jobTitle: row.job_title, status: row.status, joinedAt: row.joined_at }));
}

export async function listDepartments() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return departments;
  const { data, error } = await supabase.from("departments").select("*").order("name");
  if (error) throw error;
  return data.map((row: any) => ({ id: row.id, name: row.name, description: row.description, managerId: row.manager_id }));
}

export async function listTasks() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return tasks;
  const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row: any) => ({ id: row.id, title: row.title, description: row.description, status: row.status as TaskStatus, priority: row.priority as TaskPriority, assignedTo: row.assigned_to, createdBy: row.created_by, departmentId: row.department_id, dueDate: row.due_date, createdAt: row.created_at }));
}

export async function createTask(payload: unknown) {
  const parsed = taskSchema.parse(payload);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const task = { id: `local-${Date.now()}`, title: parsed.title, description: parsed.description, status: "TODO" as const, priority: parsed.priority, assignedTo: parsed.assignedTo, createdBy: parsed.createdBy, departmentId: parsed.departmentId, dueDate: parsed.dueDate, createdAt: new Date().toISOString() };
    await logActivity({ actorId: parsed.createdBy, action: "TASK_CREATED_LOCAL", entityType: "task", entityId: task.id, metadata: task });
    return task;
  }
  const { data, error } = await supabase.from("tasks").insert({ title: parsed.title, description: parsed.description ?? null, assigned_to: parsed.assignedTo, created_by: parsed.createdBy, department_id: parsed.departmentId, priority: parsed.priority, due_date: parsed.dueDate ?? null }).select().single();
  if (error) throw error;
  await logActivity({ actorId: parsed.createdBy, action: "TASK_CREATED", entityType: "task", entityId: data.id, metadata: { title: parsed.title, priority: parsed.priority } });
  return data;
}

export async function listDailyLogs() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return dailyLogs;
  const { data, error } = await supabase.from("daily_logs").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row: any) => ({ id: row.id, employeeId: row.employee_id, logDate: row.log_date, summary: row.summary, blockers: row.blockers, progressScore: row.progress_score, status: row.status, reviewedBy: row.reviewed_by }));
}

export async function createDailyLog(payload: unknown) {
  const parsed = logSchema.parse(payload);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const log = { id: `local-log-${Date.now()}`, employeeId: parsed.employeeId, logDate: new Date().toISOString().slice(0, 10), summary: parsed.summary, blockers: parsed.blockers, progressScore: parsed.progressScore, status: "SUBMITTED" as const };
    await logActivity({ actorId: parsed.employeeId, action: "DAILY_LOG_SUBMITTED_LOCAL", entityType: "daily_log", entityId: log.id, metadata: log });
    return log;
  }
  const { data, error } = await supabase.from("daily_logs").insert({ employee_id: parsed.employeeId, log_date: new Date().toISOString().slice(0, 10), summary: parsed.summary, blockers: parsed.blockers ?? null, progress_score: parsed.progressScore, status: "SUBMITTED" }).select().single();
  if (error) throw error;
  await logActivity({ actorId: parsed.employeeId, action: "DAILY_LOG_SUBMITTED", entityType: "daily_log", entityId: data.id, metadata: { progressScore: parsed.progressScore } });
  return data;
}

export async function listApprovals() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return approvals;
  const { data, error } = await supabase.from("approvals").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row: any) => ({ id: row.id, entityType: row.entity_type, entityId: row.entity_id, requestedBy: row.requested_by, approverId: row.approver_id, status: row.status, notes: row.notes, createdAt: row.created_at }));
}

export async function listNotifications() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return notifications;
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row: any) => ({ id: row.id, employeeId: row.employee_id, title: row.title, message: row.message, type: row.type, readAt: row.read_at, createdAt: row.created_at }));
}

export async function listActivity() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return activityLogs;
  const { data, error } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data.map((row: any) => ({ id: row.id, actorId: row.actor_id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, metadata: row.metadata, createdAt: row.created_at }));
}
