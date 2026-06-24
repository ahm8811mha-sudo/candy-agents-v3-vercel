import { ActivityLog, Approval, DailyLog, Department, Employee, Notification, Task } from "./types";

export const departments: Department[] = [
  { id: "exec", name: "الإدارة التنفيذية", description: "الاستراتيجية، القرار، واعتماد الأولويات" },
  { id: "growth", name: "النمو والمبيعات", description: "اكتساب العملاء، العروض، وتحويل الفرص إلى إيراد" },
  { id: "ops", name: "التشغيل", description: "تنفيذ الخطط، ضبط الجودة، وتسليم المهام" },
  { id: "finance", name: "المالية", description: "الميزانيات، المصروفات، والموافقات" },
];

export const employees: Employee[] = [
  { id: "e-ceo", fullName: "وكيل القرار التنفيذي", email: "ceo@candy-agents.local", role: "CEO", departmentId: "exec", jobTitle: "Decision Agent Owner", status: "ACTIVE", joinedAt: "2026-01-01" },
  { id: "e-market", fullName: "وكيل تحليل السوق", email: "market@candy-agents.local", role: "MANAGER", departmentId: "growth", managerId: "e-ceo", jobTitle: "Market Analyst Agent", status: "ACTIVE", joinedAt: "2026-01-05" },
  { id: "e-opportunity", fullName: "وكيل الفرص", email: "opportunity@candy-agents.local", role: "MANAGER", departmentId: "growth", managerId: "e-ceo", jobTitle: "Opportunity Agent", status: "ACTIVE", joinedAt: "2026-01-05" },
  { id: "e-execution", fullName: "وكيل التنفيذ", email: "execution@candy-agents.local", role: "MANAGER", departmentId: "ops", managerId: "e-ceo", jobTitle: "Execution Agent", status: "ACTIVE", joinedAt: "2026-01-08" },
];

export const tasks: Task[] = [
  {
    id: "t-1",
    title: "تحليل سوق المنتجات المحلية",
    description: "جمع اتجاهات الطلب والمنافسة والأسعار لتغذية وكيل الفرص.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    assignedTo: "e-market",
    createdBy: "e-ceo",
    departmentId: "growth",
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    progressPercent: 65,
  },
  {
    id: "t-2",
    title: "تقييم فرص الإطلاق السريع",
    description: "ترتيب أفضل الفرص حسب الربحية والمخاطر وسرعة التنفيذ.",
    status: "REVIEW",
    priority: "URGENT",
    assignedTo: "e-opportunity",
    createdBy: "e-ceo",
    departmentId: "growth",
    dueDate: new Date(Date.now() + 172800000).toISOString(),
    createdAt: new Date().toISOString(),
    progressPercent: 82,
  },
  {
    id: "t-3",
    title: "تحويل القرار إلى خطة تشغيل",
    description: "تحديد المهام، الأدوار المستقلة، الجدول الزمني، ونقاط القياس.",
    status: "TODO",
    priority: "MEDIUM",
    assignedTo: "e-execution",
    createdBy: "e-ceo",
    departmentId: "ops",
    dueDate: new Date(Date.now() + 259200000).toISOString(),
    createdAt: new Date().toISOString(),
    progressPercent: 20,
  },
];

export const dailyLogs: DailyLog[] = [
  {
    id: "l-1",
    employeeId: "e-execution",
    logDate: new Date().toISOString().slice(0, 10),
    summary: "تم تجهيز قالب تنفيذ يربط القرار بمهام قابلة للتتبع وموافقات مالية.",
    blockers: "تحتاج بعض القرارات إلى سقف ميزانية أوضح.",
    progressScore: 8,
    status: "SUBMITTED",
  },
];

export const approvals: Approval[] = [
  {
    id: "a-1",
    entityType: "DAILY_LOG",
    entityId: "l-1",
    requestedBy: "e-execution",
    approverId: "e-ceo",
    status: "PENDING",
    notes: "مراجعة خطة التنفيذ قبل تحويلها إلى مهام فعلية.",
    createdAt: new Date().toISOString(),
  },
];

export const notifications: Notification[] = [
  {
    id: "n-1",
    employeeId: "e-ceo",
    title: "خطة تنفيذ جاهزة للمراجعة",
    message: "وكيل التنفيذ أرسل خطة أولية تحتاج اعتمادًا قبل البدء.",
    type: "APPROVAL",
    createdAt: new Date().toISOString(),
  },
];

export const activityLogs: ActivityLog[] = [
  { id: "act-1", actorId: "e-market", action: "MARKET_ANALYSIS_COMPLETED", entityType: "agent_run", entityId: "demo-market", createdAt: new Date().toISOString(), metadata: { confidence: "high" } },
  { id: "act-2", actorId: "e-opportunity", action: "OPPORTUNITIES_RANKED", entityType: "agent_run", entityId: "demo-opportunity", createdAt: new Date().toISOString(), metadata: { count: 3 } },
];
