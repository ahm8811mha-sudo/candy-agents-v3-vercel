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

export function listOperatorSessions() {
  return [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createOperatorSession(input: { title?: string; targetUrl?: string; serviceName?: string; request?: string }) {
  const now = nowIso();
  const item: OperatorSession = {
    id: id(),
    title: clean(input.title) || "جلسة مشغّل جديدة",
    targetUrl: clean(input.targetUrl) || "https://gidentity.business.sa/Identity/Account/Login?LoginType=merchant",
    serviceName: clean(input.serviceName) || "تحديث بيانات الملف التجاري",
    operatorName: "ماجد",
    request: clean(input.request) || "تجهيز البيانات المطلوبة ومتابعة التعبئة مع مراجعة صاحب الصلاحية قبل الإنهاء.",
    status: "READY",
    preparedFields: defaultFields(clean(input.request)),
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
  return item;
}
