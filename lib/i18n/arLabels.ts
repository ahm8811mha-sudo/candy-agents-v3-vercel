/**
 * Arabic display labels for raw enum values that reach the Chairman's screens
 * (statuses, owner roles, priorities, risk levels, item types).
 *
 * The database and the agents keep their English codes; only the display
 * changes. An unknown value is returned unchanged so nothing disappears.
 */

const STATUS: Record<string, string> = {
  ACTIVE: "نشط",
  APPROVED: "معتمد",
  APPROVED_FOR_PILOT: "معتمد للتجربة",
  ARCHIVED: "مؤرشف",
  AWAITING_CHAIRMAN: "بانتظار قرارك",
  BLOCKED: "متعطل",
  CANCELLED: "ملغى",
  CANCELED: "ملغى",
  CLOSED: "مغلق",
  COMPLETED: "مكتمل",
  DEFERRED: "مؤجل",
  DONE: "منجز",
  DRAFT: "مسودة",
  EXECUTED: "منفّذ",
  EXPIRED: "منتهي",
  FAILED: "متعثر",
  IN_PROGRESS: "قيد التنفيذ",
  IN_REVIEW: "قيد المراجعة",
  IN_SPEND_CHAIN: "في سلسلة الصرف",
  NEW: "جديد",
  NOT_CONFIGURED: "غير مهيأ",
  NOT_STARTED: "لم يبدأ",
  ON_HOLD: "معلّق",
  ON_TRACK: "على المسار",
  OPEN: "مفتوح",
  PAID: "مدفوع",
  PAUSED: "موقوف مؤقتاً",
  PENDING: "قيد الانتظار",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  PENDING_CEO_REVIEW: "بانتظار مراجعة الرئيس التنفيذي",
  PENDING_GOVERNANCE: "بانتظار الحوكمة",
  PLANNED: "مخطط",
  PLAN_READY: "الخطة جاهزة",
  PROMISING: "واعد",
  RADAR_DRAFT: "مسودة رادار",
  READY: "جاهز",
  RECEIVED: "مستلم",
  REJECTED: "مرفوض",
  REVIEW: "قيد المراجعة",
  RUNNING: "قيد التشغيل",
  SCHEDULED: "مجدول",
  SENT: "مرسل",
  SUBMITTED: "مقدّم",
  SUCCESS: "ناجح",
  TODO: "لم تبدأ",
  UNDER_STUDY: "قيد الدراسة",
  WAITING_FUNDING: "بانتظار التمويل",
  WATCH: "تحت المراقبة",
  AT_RISK: "معرّض للخطر",
  OFF_TRACK: "خارج المسار",
  GOOD: "جيد",
  WARNING: "تنبيه",
  CRITICAL: "حرج",
};

const LEVEL: Record<string, string> = {
  LOW: "منخفض",
  MEDIUM: "متوسط",
  HIGH: "مرتفع",
  URGENT: "عاجل",
  CRITICAL: "حرج",
  NORMAL: "عادي",
};

/** English role titles used by older generators, mapped to the employee who holds the role. */
const ROLE: Record<string, string> = {
  owner: "رئيس مجلس الإدارة",
  chairman: "رئيس مجلس الإدارة",
  ceo: "سلطان (الرئيس التنفيذي)",
  "ceo office": "سلطان (المكتب التنفيذي)",
  cfo: "عبدالرحمن (المالية)",
  "finance manager": "عبدالرحمن (المالية)",
  accountant: "أمين (المحاسبة)",
  "chief accountant": "أمين (المحاسبة)",
  coo: "فهد (العمليات)",
  "operations manager": "فهد (العمليات)",
  "supply chain manager": "خالد (المشتريات والموردون)",
  "procurement manager": "خالد (المشتريات والموردون)",
  "marketing director": "نورة (التسويق)",
  "marketing manager": "نورة (التسويق)",
  marketing: "نورة (التسويق)",
  "sales manager": "سارة (الإيرادات)",
  cro: "حارس (المخاطر والحوكمة)",
  "risk manager": "حارس (المخاطر والحوكمة)",
  "risk officer": "حارس (المخاطر والحوكمة)",
  "compliance manager": "ماجد (الامتثال والعلاقات الحكومية)",
  "government relations": "ماجد (الامتثال والعلاقات الحكومية)",
  "opportunity analyst": "راصد (الاستراتيجية والفرص)",
  cgo: "راصد (الاستراتيجية والفرص)",
  manager: "مدير",
  admin: "مسؤول النظام",
  viewer: "مطّلع",
  "محلل الفرص": "راصد (الاستراتيجية والفرص)",
};

const TYPE: Record<string, string> = {
  TRADE: "صفقة تداول",
  BUDGET: "ميزانية",
  IDEA: "فكرة",
  TASK_FUNDING: "تمويل مهمة",
  COMPANY_EXECUTION: "تنفيذ مؤسسي",
  COMPANY_EXECUTION_PROJECT: "مشروع تنفيذ",
  OPPORTUNITY_REVIEW: "مراجعة فرصة",
  GENERAL: "عام",
  FINANCE: "مالي",
  POLICY: "سياسة",
  SPEND: "صرف",
  opportunity_radar_runs: "تجربة رادار الفرص",
  marketing_campaigns: "حملة تسويق",
  purchase_orders: "أمر شراء",
  projects: "مشروع",
  tasks: "مهمة",
};

function lookup(map: Record<string, string>, value: unknown): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return map[raw] ?? map[raw.toUpperCase()] ?? map[raw.toLowerCase()] ?? raw;
}

export const statusLabel = (value: unknown) => lookup(STATUS, value);
export const levelLabel = (value: unknown) => lookup(LEVEL, value);
export const typeLabel = (value: unknown) => lookup(TYPE, value);
export function roleLabel(value: unknown): string {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return "";
  return ROLE[raw.toLowerCase()] ?? lookup(TYPE, raw);
}
