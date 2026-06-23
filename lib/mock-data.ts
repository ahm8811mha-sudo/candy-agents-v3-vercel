import { ActivityLog, Approval, DailyLog, Department, Employee, Notification, Task } from "./types";

export const departments: Department[] = [
  { id: "exec", name: "الإدارة التنفيذية", description: "القيادة والتخطيط واتخاذ القرار" },
  { id: "sales", name: "المبيعات", description: "إدارة العملاء والطلبات والتحصيل" },
  { id: "factory", name: "المصنع", description: "الإنتاج والجودة والمخزون" },
  { id: "finance", name: "المالية", description: "المصاريف، الإيرادات، التقارير" },
];

export const employees: Employee[] = [
  { id: "e-ceo", fullName: "خالد العمري", email: "ceo@golden-star.local", role: "CEO", departmentId: "exec", jobTitle: "المدير التنفيذي", status: "ACTIVE", joinedAt: "2026-01-01" },
  { id: "e-sales-manager", fullName: "سارة القحطاني", email: "sales.manager@golden-star.local", role: "MANAGER", departmentId: "sales", managerId: "e-ceo", jobTitle: "مديرة المبيعات", status: "ACTIVE", joinedAt: "2026-01-05" },
  { id: "e-factory-manager", fullName: "ناصر الحربي", email: "factory.manager@golden-star.local", role: "MANAGER", departmentId: "factory", managerId: "e-ceo", jobTitle: "مدير المصنع", status: "ACTIVE", joinedAt: "2026-01-05" },
  { id: "e-employee-1", fullName: "محمد السالم", email: "employee@golden-star.local", role: "EMPLOYEE", departmentId: "factory", managerId: "e-factory-manager", jobTitle: "مشرف إنتاج", status: "ACTIVE", joinedAt: "2026-02-10" },
];

export const tasks: Task[] = [
  { id: "t-1", title: "تجهيز تقرير الإنتاج اليومي", description: "تجميع كميات الإنتاج والهدر والملاحظات التشغيلية.", status: "IN_PROGRESS", priority: "HIGH", assignedTo: "e-employee-1", createdBy: "e-factory-manager", departmentId: "factory", dueDate: new Date(Date.now()+86400000).toISOString(), createdAt: new Date().toISOString() },
  { id: "t-2", title: "مراجعة طلبات العملاء المتأخرة", description: "تحليل أسباب التأخير وتجهيز خطة إغلاق.", status: "REVIEW", priority: "URGENT", assignedTo: "e-sales-manager", createdBy: "e-ceo", departmentId: "sales", dueDate: new Date(Date.now()+172800000).toISOString(), createdAt: new Date().toISOString() },
  { id: "t-3", title: "تدقيق مخزون المواد الخام", description: "مقارنة المخزون الفعلي مع النظام وتسجيل الفروقات.", status: "TODO", priority: "MEDIUM", assignedTo: "e-factory-manager", createdBy: "e-ceo", departmentId: "factory", dueDate: new Date(Date.now()+259200000).toISOString(), createdAt: new Date().toISOString() },
];

export const dailyLogs: DailyLog[] = [
  { id: "l-1", employeeId: "e-employee-1", logDate: new Date().toISOString().slice(0,10), summary: "تم إنجاز تشغيل خط الإنتاج الأول ومراجعة جودة أولية.", blockers: "نقص في أحد مواد التغليف.", progressScore: 8, status: "SUBMITTED" },
];

export const approvals: Approval[] = [
  { id: "a-1", entityType: "DAILY_LOG", entityId: "l-1", requestedBy: "e-employee-1", approverId: "e-factory-manager", status: "PENDING", notes: "بانتظار مراجعة مدير المصنع", createdAt: new Date().toISOString() },
];

export const notifications: Notification[] = [
  { id: "n-1", employeeId: "e-factory-manager", title: "اعتماد مطلوب", message: "يوجد سجل يومي بانتظار المراجعة.", type: "APPROVAL", createdAt: new Date().toISOString() },
];

export const activityLogs: ActivityLog[] = [
  { id: "act-1", actorId: "e-employee-1", action: "DAILY_LOG_SUBMITTED", entityType: "daily_log", entityId: "l-1", createdAt: new Date().toISOString(), metadata: { progressScore: 8 } },
  { id: "act-2", actorId: "e-ceo", action: "TASK_CREATED", entityType: "task", entityId: "t-2", createdAt: new Date().toISOString(), metadata: { priority: "URGENT" } },
];
