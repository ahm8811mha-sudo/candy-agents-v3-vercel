import { z } from "zod";
import { activityLogs, approvals, dailyLogs, departments, employees, notifications, tasks } from "./mock-data";
import { logActivity } from "./logger";
import { getSupabaseAdmin } from "./supabase";
import { TaskPriority, TaskStatus } from "./types";

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const taskSchema = z.object({ title: z.string().min(2), description: z.string().optional(), assignedTo: z.string(), createdBy: z.string().default("e-ceo"), departmentId: z.string(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"), dueDate: z.string().optional(), progressPercent: z.number().min(0).max(100).optional() });
const logSchema = z.object({ employeeId: z.string(), summary: z.string().min(2), achievements: z.string().optional(), blockers: z.string().optional(), nextStep: z.string().optional(), progressScore: z.number().min(1).max(10).default(7) });

function mapEmployee(r: any) { return { id: r.id, fullName: r.full_name, email: r.email, phone: r.phone, role: r.role, departmentId: r.department_id, managerId: r.manager_id, jobTitle: r.job_title, status: r.status, joinedAt: r.joined_at }; }
function mapTask(r: any) { return { id: r.id, title: r.title, description: r.description, status: r.status as TaskStatus, priority: r.priority as TaskPriority, assignedTo: r.assigned_to, createdBy: r.created_by, departmentId: r.department_id, dueDate: r.due_date, createdAt: r.created_at, progressPercent: r.progress_percent ?? 0 }; }
function mapLog(r: any) { return { id: r.id, employeeId: r.employee_id, logDate: r.log_date, summary: r.summary, achievements: r.achievements, blockers: r.blockers, nextStep: r.next_step, progressScore: r.progress_score, status: r.status, reviewedBy: r.reviewed_by }; }

export async function listEmployees() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return employees;
  const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.length ? data.map(mapEmployee) : employees;
}

export async function listDepartments() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return departments;
  const { data, error } = await supabase.from("departments").select("*").order("name");
  if (error) throw error;
  return data.length ? data.map((r: any) => ({ id: r.id, name: r.name, description: r.description, managerId: r.manager_id })) : departments;
}

export async function listTasks() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return tasks;
  const { data, error } = await supabase.from("tasks").select("*").is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return data.length ? data.map(mapTask) : tasks;
}

async function enforceUrgentLimit(createdBy: string, priority: string) {
  if (priority !== "URGENT") return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const start = new Date(); start.setHours(0,0,0,0);
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("created_by", createdBy).eq("priority", "URGENT").gte("created_at", start.toISOString());
  if ((count ?? 0) >= 3) throw new Error("تم تجاوز الحد اليومي للطلبات العاجلة. الحد الأقصى 3 طلبات عاجلة يوميًا.");
}

export async function createTask(payload: unknown) {
  const p = taskSchema.parse(payload);
  await enforceUrgentLimit(p.createdBy, p.priority);
  const taskId = newId("task");
  const dueDate = p.dueDate || inDays(p.priority === "URGENT" ? 1 : p.priority === "HIGH" ? 3 : 7);
  const progress = p.progressPercent ?? 0;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const local = { id: taskId, title: p.title, description: p.description, status: "TODO" as const, priority: p.priority, assignedTo: p.assignedTo, createdBy: p.createdBy, departmentId: p.departmentId, dueDate, createdAt: new Date().toISOString(), progressPercent: progress };
    await logActivity({ actorId: p.createdBy, action: "TASK_CREATED_LOCAL", entityType: "task", entityId: taskId, metadata: local });
    return local;
  }
  const { data, error } = await supabase.from("tasks").insert({ id: taskId, title: p.title, description: p.description ?? "", assigned_to: p.assignedTo, created_by: p.createdBy, department_id: p.departmentId, priority: p.priority, due_date: dueDate, status: "TODO", progress_percent: progress }).select().single();
  if (error) throw error;
  await supabase.from("notifications").insert({ id: newId("notif"), employee_id: p.assignedTo, title: "مهمة جديدة", message: p.title, type: "TASK" });
  await logActivity({ actorId: p.createdBy, action: "TASK_CREATED", entityType: "task", entityId: taskId, metadata: { title: p.title, dueDate, progress } });
  return mapTask(data);
}

export async function listDailyLogs() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return dailyLogs;
  const { data, error } = await supabase.from("daily_logs").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.length ? data.map(mapLog) : dailyLogs;
}

async function resolveApprover(employeeId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return employeeId === "e-ceo" ? "e-finance-manager" : "e-ceo";
  const { data } = await supabase.from("employees").select("id, manager_id, role").eq("id", employeeId).single();
  const manager = data?.manager_id;
  if (manager && manager !== employeeId) return manager;
  if (employeeId === "e-ceo") return "e-finance-manager";
  return "e-ceo";
}

export async function createDailyLog(payload: unknown) {
  const p = logSchema.parse(payload);
  const logId = newId("log");
  const structuredSummary = [p.summary, p.achievements ? `الإنجازات: ${p.achievements}` : "", p.blockers ? `العقبات: ${p.blockers}` : "", p.nextStep ? `الخطوة التالية: ${p.nextStep}` : ""].filter(Boolean).join("\n");
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const local = { id: logId, employeeId: p.employeeId, logDate: new Date().toISOString().slice(0, 10), summary: structuredSummary, blockers: p.blockers, nextStep: p.nextStep, progressScore: p.progressScore, status: "SUBMITTED" as const };
    await logActivity({ actorId: p.employeeId, action: "DAILY_LOG_SUBMITTED_LOCAL", entityType: "daily_log", entityId: logId, metadata: local });
    return local;
  }
  const { data, error } = await supabase.from("daily_logs").insert({ id: logId, employee_id: p.employeeId, log_date: new Date().toISOString().slice(0, 10), summary: structuredSummary, achievements: p.achievements ?? "", blockers: p.blockers ?? "", next_step: p.nextStep ?? "", progress_score: p.progressScore, status: "SUBMITTED" }).select().single();
  if (error) throw error;
  const approverId = await resolveApprover(p.employeeId);
  await supabase.from("approvals").insert({ id: newId("approval"), entity_type: "DAILY_LOG", entity_id: logId, requested_by: p.employeeId, approver_id: approverId, status: "PENDING", notes: "تقرير يومي منظم بانتظار مراجعة مدير مختلف" });
  await supabase.from("notifications").insert({ id: newId("notif"), employee_id: approverId, title: "تقرير يومي جديد", message: structuredSummary.slice(0, 120), type: "APPROVAL" });
  await logActivity({ actorId: p.employeeId, action: "DAILY_LOG_SUBMITTED", entityType: "daily_log", entityId: logId, metadata: { progressScore: p.progressScore, approverId } });
  return mapLog(data);
}

export async function listApprovals() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return approvals;
  const { data, error } = await supabase.from("approvals").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.length ? data.map((r: any) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, requestedBy: r.requested_by, approverId: r.approver_id, status: r.status, notes: r.notes, createdAt: r.created_at })) : approvals;
}

export async function listNotifications() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return notifications;
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.length ? data.map((r: any) => ({ id: r.id, employeeId: r.employee_id, title: r.title, message: r.message, type: r.type, readAt: r.read_at, createdAt: r.created_at })) : notifications;
}

export async function listActivity() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return activityLogs;
  const { data, error } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data.length ? data.map((r: any) => ({ id: r.id, actorId: r.actor_id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, metadata: r.metadata, createdAt: r.created_at })) : activityLogs;
}
