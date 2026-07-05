import { fetchRows, hydrateOnce, persist } from "./supabase";

export type OperatorSessionStatus = "DRAFT" | "READY" | "OPENED" | "FILLING" | "REVIEW" | "DONE" | "BLOCKED";

export type OperatorSession = {
  id: string;
  title: string;
  targetUrl: string;
  serviceName: string;
  operatorName: string;
  request: string;
  status: OperatorSessionStatus;
  preparedFields: Array<{ label: string; value: string }>;
  checklist: Array<{ label: string; done: boolean }>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const sessions: OperatorSession[] = [];

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function defaultFields(request: string) {
  const fields = [
    { label: "اسم الملف التجاري بالعربية", value: "" },
    { label: "اسم الملف التجاري بالإنجليزية", value: "" },
    { label: "وصف النشاط بالعربية", value: "" },
    { label: "وصف النشاط بالإنجليزية", value: "" },
    { label: "الموقع الإلكتروني", value: "" },
    { label: "قنوات التواصل", value: "" },
    { label: "المنتجات أو الخدمات", value: "" },
    { label: "منافذ البيع", value: "" },
  ];
  if (request) fields.unshift({ label: "ملخص الطلب", value: request });
  return fields;
}

function toRow(item: OperatorSession): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    target_url: item.targetUrl,
    service_name: item.serviceName,
    operator_name: item.operatorName,
    request: item.request,
    status: item.status,
    prepared_fields: item.preparedFields,
    checklist: item.checklist,
    notes: item.notes,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function fromRow(row: Record<string, unknown>): OperatorSession {
  return {
    id: String(row.id),
    title: clean(row.title) || "جلسة مشغّل",
    targetUrl: clean(row.target_url) || "https://gidentity.business.sa/Identity/Account/Login?LoginType=merchant",
    serviceName: clean(row.service_name) || "تحديث بيانات الملف التجاري",
    operatorName: clean(row.operator_name) || "ماجد",
    request: clean(row.request),
    status: (clean(row.status) || "READY") as OperatorSessionStatus,
    preparedFields: Array.isArray(row.prepared_fields) ? (row.prepared_fields as OperatorSession["preparedFields"]) : [],
    checklist: Array.isArray(row.checklist) ? (row.checklist as OperatorSession["checklist"]) : [],
    notes: clean(row.notes),
    createdAt: clean(row.created_at) || nowIso(),
    updatedAt: clean(row.updated_at) || nowIso(),
  };
}

export const hydrateOperatorSessions = hydrateOnce(async () => {
  const rows = await fetchRows("operator_sessions", { orderBy: "created_at", limit: 100 });
  const seen = new Set(sessions.map((item) => item.id));
  for (const row of rows) {
    if (!seen.has(String(row.id))) sessions.push(fromRow(row));
  }
  sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

export function listOperatorSessions() {
  return [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createOperatorSession(input: { title?: string; targetUrl?: string; serviceName?: string; request?: string }) {
  const now = nowIso();
  const request = clean(input.request) || "تجهيز البيانات المطلوبة ومتابعة التعبئة مع مراجعة صاحب الصلاحية قبل الإنهاء.";
  const item: OperatorSession = {
    id: id(),
    title: clean(input.title) || "جلسة مشغّل جديدة",
    targetUrl: clean(input.targetUrl) || "https://gidentity.business.sa/Identity/Account/Login?LoginType=merchant",
    serviceName: clean(input.serviceName) || "تحديث بيانات الملف التجاري",
    operatorName: "ماجد",
    request,
    status: "READY",
    preparedFields: defaultFields(request),
    checklist: [
      { label: "تجهيز البيانات المطلوبة", done: false },
      { label: "فتح الرابط الرسمي", done: false },
      { label: "مراجعة صاحب الصلاحية", done: false },
      { label: "تعبئة الحقول المطلوبة", done: false },
      { label: "مراجعة نهائية قبل الإنهاء", done: false },
      { label: "حفظ رقم المرجع بعد الإنهاء", done: false },
    ],
    notes: "لا تحفظ بيانات دخول أو رموز تحقق داخل النظام.",
    createdAt: now,
    updatedAt: now,
  };
  sessions.unshift(item);
  persist("operator_sessions", toRow(item));
  return item;
}

export function updateOperatorSession(idValue: string, patch: Partial<Pick<OperatorSession, "status" | "notes" | "preparedFields" | "checklist">>) {
  const item = sessions.find((row) => row.id === idValue);
  if (!item) throw new Error("Session not found");
  if (patch.status) item.status = patch.status;
  if (patch.notes !== undefined) item.notes = patch.notes;
  if (patch.preparedFields) item.preparedFields = patch.preparedFields;
  if (patch.checklist) item.checklist = patch.checklist;
  item.updatedAt = nowIso();
  persist("operator_sessions", toRow(item));
  return item;
}
