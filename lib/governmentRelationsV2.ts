import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { createCompanyEvent } from "./company-os/events";
import { appendCompanyEvent } from "./company-os/outboxPublisher";

export type GovernmentContext = {
  tenantId: string;
  actorId: string;
  actorRole: string;
  actorName?: string;
  correlationId?: string;
};

export type GovernmentUploadInput = {
  documentType?: string;
  title?: string;
  issuer?: string;
  notes?: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
};

type AnalysisAction = {
  title: string;
  description: string;
  dueDate?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  portalUrl?: string;
  requiresOwnerCheckpoint: boolean;
};

type AnalysisRisk = {
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  detail: string;
};

type AnalysisObligation = {
  title: string;
  dueDate?: string;
  source?: string;
};

export type GovernmentDocumentAnalysis = {
  documentType: string;
  documentNumber: string;
  title: string;
  issuer: string;
  ownerName: string;
  taxNumber: string;
  startDate: string;
  expiryDate: string;
  renewalDate: string;
  city: string;
  activity: string;
  confidence: number;
  missingFields: string[];
  summary: string;
  obligations: AnalysisObligation[];
  recommendedActions: AnalysisAction[];
  risks: AnalysisRisk[];
  requiresOwnerCheckpoint: true;
};

type AnalysisResult = {
  analysis: GovernmentDocumentAnalysis;
  engine: string;
  model: string | null;
  latencyMs: number;
  error: string | null;
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const GOVERNMENT_BUCKET = "government-documents";
const DOCUMENT_MODEL = process.env.OPENAI_DOCUMENT_MODEL || "gpt-4.1-mini";

const DOCUMENT_TYPES = new Set([
  "COMMERCIAL_REGISTRATION",
  "VAT_CERTIFICATE",
  "ZAKAT_TAX_CERTIFICATE",
  "CHAMBER_SUBSCRIPTION",
  "MUNICIPAL_LICENSE",
  "WORK_PERMIT",
  "INVESTMENT_LICENSE",
  "OTHER_GOVERNMENT_DOCUMENT",
]);

const REQUIRED_FIELDS: Record<string, string[]> = {
  COMMERCIAL_REGISTRATION: ["documentNumber", "issuer", "startDate", "expiryDate", "ownerName"],
  VAT_CERTIFICATE: ["taxNumber", "issuer", "startDate", "ownerName"],
  ZAKAT_TAX_CERTIFICATE: ["documentNumber", "issuer", "expiryDate", "ownerName"],
  CHAMBER_SUBSCRIPTION: ["documentNumber", "issuer", "expiryDate", "ownerName"],
  MUNICIPAL_LICENSE: ["documentNumber", "issuer", "expiryDate", "city", "activity"],
  WORK_PERMIT: ["documentNumber", "issuer", "expiryDate", "ownerName"],
  INVESTMENT_LICENSE: ["documentNumber", "issuer", "startDate", "expiryDate", "ownerName"],
  OTHER_GOVERNMENT_DOCUMENT: ["documentNumber", "issuer", "expiryDate"],
};

const TYPE_TITLES: Record<string, string> = {
  COMMERCIAL_REGISTRATION: "السجل التجاري",
  VAT_CERTIFICATE: "شهادة ضريبة القيمة المضافة",
  ZAKAT_TAX_CERTIFICATE: "شهادة الزكاة والضريبة",
  CHAMBER_SUBSCRIPTION: "اشتراك الغرفة التجارية",
  MUNICIPAL_LICENSE: "الرخصة البلدية",
  WORK_PERMIT: "رخصة العمل",
  INVESTMENT_LICENSE: "ترخيص الاستثمار",
  OTHER_GOVERNMENT_DOCUMENT: "وثيقة حكومية",
};

function supabase() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is required for government document processing.");
  return client;
}

function clean(value: unknown) {
  return String(value || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function safeTenantPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 48) || "tenant";
}

function sanitizeFileName(value: string) {
  const extension = value.includes(".") ? `.${value.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 8)}` : "";
  const base = value.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${base || "government-document"}${extension}`;
}

function hashFile(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function dateOnly(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  const normalized = text.replace(/\//g, "-");
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
}

function daysUntil(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function renewalDate(expiryDate: string) {
  if (!expiryDate) return "";
  const date = new Date(expiryDate);
  if (!Number.isFinite(date.getTime())) return "";
  date.setDate(date.getDate() - 45);
  return date.toISOString().slice(0, 10);
}

function documentStatus(expiryDate: string, missing: string[]) {
  if (missing.length) return "NEEDS_REVIEW";
  const remaining = daysUntil(expiryDate);
  if (remaining === null) return "NEEDS_REVIEW";
  if (remaining < 0) return "EXPIRED";
  if (remaining <= 30) return "RENEWAL_URGENT";
  if (remaining <= 90) return "RENEWAL_SOON";
  return "ACTIVE";
}

function validateUpload(input: GovernmentUploadInput) {
  if (!input.fileName || !input.fileBase64) throw new Error("الملف مطلوب.");
  const mime = clean(input.mimeType).toLowerCase();
  const allowed = mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/") || /\.(pdf|png|jpe?g|webp|txt|csv|json)$/i.test(input.fileName);
  if (!allowed) throw new Error("نوع الملف غير مدعوم. استخدم PDF أو صورة أو ملفاً نصياً.");
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (!buffer.length) throw new Error("الملف فارغ أو غير صالح.");
  if (buffer.length > MAX_FILE_BYTES) throw new Error("حجم الملف أكبر من 8 ميجابايت.");
  if (/كلمة المرور|password|رمز التحقق|verification code|\botp\b/i.test(input.notes || "")) {
    throw new Error("لا تضع كلمة مرور أو رمز تحقق أو بيانات نفاذ داخل الملاحظات.");
  }
  return buffer;
}

function detectType(input: GovernmentUploadInput, source = "") {
  if (input.documentType && DOCUMENT_TYPES.has(input.documentType)) return input.documentType;
  const text = `${input.fileName} ${input.title || ""} ${input.issuer || ""} ${input.notes || ""} ${source}`.toLowerCase();
  if (/سجل تجاري|السجل التجاري|commercial registration|commercial register/.test(text)) return "COMMERCIAL_REGISTRATION";
  if (/القيمة المضافة|الرقم الضريبي|\bvat\b|value added/.test(text)) return "VAT_CERTIFICATE";
  if (/زكاة|زكوي|zakat/.test(text)) return "ZAKAT_TAX_CERTIFICATE";
  if (/الغرفة التجارية|chamber/.test(text)) return "CHAMBER_SUBSCRIPTION";
  if (/بلدي|رخصة بلدية|municipal|balady/.test(text)) return "MUNICIPAL_LICENSE";
  if (/رخصة عمل|work permit|qiwa|قوى/.test(text)) return "WORK_PERMIT";
  if (/ترخيص استثمار|investment license|misa/.test(text)) return "INVESTMENT_LICENSE";
  return "OTHER_GOVERNMENT_DOCUMENT";
}

function extractFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function fallbackAnalysis(input: GovernmentUploadInput): GovernmentDocumentAnalysis {
  let text = "";
  try {
    const mime = input.mimeType.toLowerCase();
    if (mime.startsWith("text/") || /\.(txt|csv|json)$/i.test(input.fileName)) {
      text = Buffer.from(input.fileBase64, "base64").toString("utf8").slice(0, 12000);
    }
  } catch {
    text = "";
  }
  text = `${text}\n${input.notes || ""}\n${input.fileName}`;
  const documentType = detectType(input, text);
  const documentNumber = extractFirst(text, [
    /(?:رقم السجل|رقم الترخيص|رقم الوثيقة|commercial registration|license no\.?|document no\.?)\s*[:\-]?\s*([0-9A-Za-z\-/]+)/i,
  ]);
  const taxNumber = extractFirst(text, [/(?:الرقم الضريبي|tax number|vat number)\s*[:\-]?\s*([0-9A-Za-z\-/]+)/i]);
  const startDate = dateOnly(extractFirst(text, [/(?:تاريخ الإصدار|issue date|valid from)\s*[:\-]?\s*([0-9]{4}[\-/][0-9]{1,2}[\-/][0-9]{1,2})/i]));
  const expiryDate = dateOnly(extractFirst(text, [/(?:تاريخ الانتهاء|expiry date|valid until)\s*[:\-]?\s*([0-9]{4}[\-/][0-9]{1,2}[\-/][0-9]{1,2})/i]));
  const issuer = clean(input.issuer);
  const partial: GovernmentDocumentAnalysis = {
    documentType,
    documentNumber,
    title: clean(input.title) || TYPE_TITLES[documentType],
    issuer,
    ownerName: "",
    taxNumber,
    startDate,
    expiryDate,
    renewalDate: renewalDate(expiryDate),
    city: "",
    activity: "",
    confidence: documentNumber || taxNumber || expiryDate ? 0.55 : 0.2,
    missingFields: [],
    summary: "تم حفظ الملف، لكن التحليل الذكي لم يكن متاحاً أو تعذر قراءة محتواه آلياً. أُنشئت مهمة مراجعة لماجد.",
    obligations: [],
    recommendedActions: [],
    risks: [{ level: "MEDIUM", title: "مراجعة بشرية مطلوبة", detail: "لم يكتمل استخراج البيانات من الوثيقة." }],
    requiresOwnerCheckpoint: true,
  };
  const required = REQUIRED_FIELDS[documentType] || REQUIRED_FIELDS.OTHER_GOVERNMENT_DOCUMENT;
  partial.missingFields = required.filter((field) => !clean((partial as unknown as Record<string, unknown>)[field]));
  partial.recommendedActions = [{
    title: `مراجعة بيانات ${partial.title}`,
    description: "يقوم ماجد بمراجعة الوثيقة والبيانات المستخرجة وتجهيز الإجراء، ثم يتوقف قبل نفاذ أو رمز التحقق أو الدفع أو الإرسال النهائي.",
    priority: partial.missingFields.length ? "HIGH" : "MEDIUM",
    requiresOwnerCheckpoint: true,
  }];
  return partial;
}

function responseText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .map((part: any) => part?.text || part?.output_text || "")
    .filter(Boolean)
    .join("\n");
}

function jsonFromText(value: string) {
  const fenced = value.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end > start ? value.slice(start, end + 1) : "{}";
}

function normalizeAnalysis(input: GovernmentUploadInput, value: any): GovernmentDocumentAnalysis {
  const type = DOCUMENT_TYPES.has(clean(value.documentType)) ? clean(value.documentType) : detectType(input, `${value.title || ""} ${value.issuer || ""}`);
  const analysis: GovernmentDocumentAnalysis = {
    documentType: type,
    documentNumber: clean(value.documentNumber),
    title: clean(value.title) || clean(input.title) || TYPE_TITLES[type],
    issuer: clean(value.issuer) || clean(input.issuer),
    ownerName: clean(value.ownerName),
    taxNumber: clean(value.taxNumber),
    startDate: dateOnly(value.startDate),
    expiryDate: dateOnly(value.expiryDate),
    renewalDate: dateOnly(value.renewalDate),
    city: clean(value.city),
    activity: clean(value.activity),
    confidence: Math.min(1, Math.max(0, Number(value.confidence) || 0)),
    missingFields: Array.isArray(value.missingFields) ? value.missingFields.map(clean).filter(Boolean) : [],
    summary: clean(value.summary) || "تم تحليل الوثيقة الحكومية.",
    obligations: Array.isArray(value.obligations) ? value.obligations.map((item: any) => ({ title: clean(item.title), dueDate: dateOnly(item.dueDate), source: clean(item.source) })).filter((item: AnalysisObligation) => item.title) : [],
    recommendedActions: Array.isArray(value.recommendedActions) ? value.recommendedActions.map((item: any) => ({
      title: clean(item.title),
      description: clean(item.description),
      dueDate: dateOnly(item.dueDate),
      priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(clean(item.priority).toUpperCase()) ? clean(item.priority).toUpperCase() : "MEDIUM",
      portalUrl: /^https:\/\//i.test(clean(item.portalUrl)) ? clean(item.portalUrl) : undefined,
      requiresOwnerCheckpoint: true,
    })).filter((item: AnalysisAction) => item.title) : [],
    risks: Array.isArray(value.risks) ? value.risks.map((item: any) => ({
      level: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(clean(item.level).toUpperCase()) ? clean(item.level).toUpperCase() : "MEDIUM",
      title: clean(item.title),
      detail: clean(item.detail),
    })).filter((item: AnalysisRisk) => item.title) : [],
    requiresOwnerCheckpoint: true,
  } as GovernmentDocumentAnalysis;
  if (!analysis.renewalDate) analysis.renewalDate = renewalDate(analysis.expiryDate);
  const required = REQUIRED_FIELDS[type] || REQUIRED_FIELDS.OTHER_GOVERNMENT_DOCUMENT;
  analysis.missingFields = Array.from(new Set([...analysis.missingFields, ...required.filter((field) => !clean((analysis as unknown as Record<string, unknown>)[field]))]));
  if (!analysis.recommendedActions.length) {
    analysis.recommendedActions.push({
      title: `مراجعة ومتابعة ${analysis.title}`,
      description: "يقوم ماجد بالتحقق من المتطلبات الرسمية وتجهيز الحقول، ويتوقف قبل الاعتماد أو نفاذ أو رمز التحقق أو الدفع أو الإرسال النهائي.",
      dueDate: analysis.renewalDate || analysis.expiryDate || undefined,
      priority: analysis.missingFields.length ? "HIGH" : "MEDIUM",
      requiresOwnerCheckpoint: true,
    });
  }
  return analysis;
}

async function analyzeWithOpenAI(input: GovernmentUploadInput): Promise<AnalysisResult> {
  const started = Date.now();
  if (!process.env.OPENAI_API_KEY) {
    return { analysis: fallbackAnalysis(input), engine: "rules_fallback", model: null, latencyMs: 0, error: "OPENAI_API_KEY is not configured" };
  }

  const prompt = `حلل الوثيقة الحكومية السعودية المرفقة واستخـرج فقط المعلومات الظاهرة فعلاً. لا تخمّن ولا تستنتج رقماً غير ظاهر.
أعد JSON فقط بهذه البنية:
{
  "documentType":"COMMERCIAL_REGISTRATION|VAT_CERTIFICATE|ZAKAT_TAX_CERTIFICATE|CHAMBER_SUBSCRIPTION|MUNICIPAL_LICENSE|WORK_PERMIT|INVESTMENT_LICENSE|OTHER_GOVERNMENT_DOCUMENT",
  "documentNumber":"",
  "title":"",
  "issuer":"",
  "ownerName":"",
  "taxNumber":"",
  "startDate":"YYYY-MM-DD أو فارغ",
  "expiryDate":"YYYY-MM-DD أو فارغ",
  "renewalDate":"YYYY-MM-DD أو فارغ",
  "city":"",
  "activity":"",
  "confidence":0.0,
  "missingFields":[],
  "summary":"ملخص عربي عملي",
  "obligations":[{"title":"","dueDate":"YYYY-MM-DD أو فارغ","source":""}],
  "recommendedActions":[{"title":"","description":"","dueDate":"YYYY-MM-DD أو فارغ","priority":"LOW|MEDIUM|HIGH|URGENT","portalUrl":"","requiresOwnerCheckpoint":true}],
  "risks":[{"level":"LOW|MEDIUM|HIGH|CRITICAL","title":"","detail":""}],
  "requiresOwnerCheckpoint":true
}
قواعد إلزامية:
- لا تستخرج أو تحفظ رقم الهوية الوطنية أو كلمات المرور أو رموز OTP أو بيانات نفاذ أو بيانات الدخول.
- أي إجراء حكومي يجب أن يتوقف قبل الاعتماد النهائي أو نفاذ أو رمز التحقق أو الدفع أو الإرسال النهائي.
- اذكر الحقول غير الظاهرة في missingFields.
- اكتب النتائج بالعربية مع إبقاء الأرقام كما تظهر.
بيانات المستخدم: النوع المختار ${input.documentType || "غير محدد"}، العنوان ${input.title || "غير محدد"}، الجهة ${input.issuer || "غير محددة"}، الملاحظة ${input.notes || "لا يوجد"}.`;

  const content: any[] = [{ type: "input_text", text: prompt }];
  const dataUrl = `data:${input.mimeType || "application/octet-stream"};base64,${input.fileBase64}`;
  if (input.mimeType === "application/pdf" || /\.pdf$/i.test(input.fileName)) {
    content.unshift({ type: "input_file", filename: input.fileName, file_data: dataUrl, detail: "high" });
  } else if (input.mimeType.startsWith("image/")) {
    content.unshift({ type: "input_image", image_url: dataUrl, detail: "high" });
  } else {
    const text = Buffer.from(input.fileBase64, "base64").toString("utf8").slice(0, 18000);
    content.push({ type: "input_text", text: `محتوى الملف:\n${text}` });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: DOCUMENT_MODEL,
        input: [{ role: "user", content }],
        temperature: 0,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clean(payload?.error?.message) || `OpenAI returned HTTP ${response.status}`);
    const raw = responseText(payload);
    const parsed = JSON.parse(jsonFromText(raw));
    return {
      analysis: normalizeAnalysis(input, parsed),
      engine: input.mimeType === "application/pdf" ? "openai_responses_pdf" : input.mimeType.startsWith("image/") ? "openai_responses_vision" : "openai_responses_text",
      model: DOCUMENT_MODEL,
      latencyMs: Date.now() - started,
      error: null,
    };
  } catch (error) {
    return {
      analysis: fallbackAnalysis(input),
      engine: "rules_fallback",
      model: DOCUMENT_MODEL,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 1200) : "Document analysis failed",
    };
  }
}

async function ensureDepartment(context: GovernmentContext) {
  const db = supabase();
  const tenantSuffix = context.tenantId === "golden-star" ? "" : `-${safeTenantPart(context.tenantId)}`;
  const departmentId = `government-relations${tenantSuffix}`;
  const employeeId = `e-government-manager${tenantSuffix}`;
  const { error: departmentError } = await db.from("departments").upsert({
    id: departmentId,
    tenant_id: context.tenantId,
    name: "إدارة العلاقات الحكومية",
    description: "تحليل الوثائق الحكومية وحفظها ومتابعتها وتجهيز الإجراءات الرسمية تحت اعتماد المالك.",
  }, { onConflict: "id" });
  if (departmentError) throw departmentError;
  const { error: employeeError } = await db.from("employees").upsert({
    id: employeeId,
    tenant_id: context.tenantId,
    full_name: "ماجد",
    email: context.tenantId === "golden-star" ? "government.relations@company.ai" : `government.relations+${safeTenantPart(context.tenantId)}@company.ai`,
    role: "MANAGER",
    department_id: departmentId,
    manager_id: "e-ceo",
    job_title: "مسؤول العلاقات الحكومية",
    status: "ACTIVE",
  }, { onConflict: "id" });
  if (employeeError) throw employeeError;
  return { departmentId, employeeId };
}

async function ensureBucket() {
  const db = supabase();
  const bucket = await db.storage.getBucket(GOVERNMENT_BUCKET);
  if (!bucket.error) return;
  const created = await db.storage.createBucket(GOVERNMENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_BYTES,
    allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv", "application/json"],
  });
  if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
}

async function feeSourceFor(tenantId: string, documentType: string) {
  const db = supabase();
  const { data, error } = await db.from("gov_fee_sources").select("*").eq("tenant_id", tenantId).eq("document_type", documentType).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

function taskPriority(status: string, missingFields: string[]) {
  if (status === "EXPIRED" || status === "RENEWAL_URGENT") return "URGENT";
  if (missingFields.length || status === "RENEWAL_SOON") return "HIGH";
  return "MEDIUM";
}

async function createFollowUpAutomation(context: GovernmentContext, document: any, analysis: GovernmentDocumentAnalysis, feeSource: any) {
  const db = supabase();
  const { departmentId, employeeId } = await ensureDepartment(context);
  const priority = taskPriority(document.status, analysis.missingFields);
  const dueDate = analysis.renewalDate || analysis.expiryDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const reviewTaskId = `task-gov-review-${document.id}`;
  const renewalTaskId = `renew-${document.id}`;
  const sessionId = `gov-session-${document.id}`;
  const queueId = `gov-work-${document.id}`;
  const preparedFields = [
    ["نوع الوثيقة", analysis.documentType],
    ["اسم الوثيقة", analysis.title],
    ["رقم الوثيقة", analysis.documentNumber],
    ["الجهة", analysis.issuer],
    ["اسم المنشأة/المالك", analysis.ownerName],
    ["الرقم الضريبي", analysis.taxNumber],
    ["تاريخ الإصدار", analysis.startDate],
    ["تاريخ الانتهاء", analysis.expiryDate],
    ["المدينة", analysis.city],
    ["النشاط", analysis.activity],
  ].filter(([, value]) => Boolean(value)).map(([label, value]) => ({ label, value }));
  const portalUrl = feeSource?.renewal_url || feeSource?.official_url || analysis.recommendedActions.find((item) => item.portalUrl)?.portalUrl || "https://business.sa";
  const checklist = [
    "مراجعة الملف الأصلي والبيانات المستخرجة",
    "التحقق من متطلبات الجهة الرسمية والرسوم الحالية",
    "تجهيز الحقول والقيم القابلة للنسخ",
    "فتح الرابط الرسمي فقط وعدم استخدام روابط غير موثوقة",
    "التوقف قبل نفاذ أو كلمة المرور أو رمز التحقق أو الدفع أو الإرسال النهائي",
    "طلب اعتماد المالك وإكمال الخطوة الحساسة بواسطته شخصياً",
    "توثيق النتيجة وتحديث حالة الوثيقة والمهمة",
  ];

  const operations: Array<{ name: string; ok: boolean; error?: string }> = [];
  async function run(name: string, operation: () => Promise<any>) {
    try {
      await operation();
      operations.push({ name, ok: true });
    } catch (error) {
      operations.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await run("company_task", async () => {
    const { error } = await db.from("tasks").upsert({
      id: reviewTaskId,
      tenant_id: context.tenantId,
      title: `مراجعة ومتابعة ${analysis.title}`,
      description: `${analysis.summary}\nالحقول الناقصة: ${analysis.missingFields.join("، ") || "لا يوجد"}.`,
      content: "ماجد يراجع الوثيقة، يجهز الإجراء والحقول، ويتوقف عند نقطة اعتماد المالك.",
      status: "TODO",
      priority,
      assigned_to: employeeId,
      created_by: context.actorId,
      department_id: departmentId,
      due_date: dueDate,
      progress_percent: 0,
      owner_role: "Government Relations Manager",
      source_table: "gov_documents",
      source_id: document.id,
      task_type: analysis.missingFields.length ? "GOVERNMENT_DOCUMENT_DATA_COMPLETION" : "GOVERNMENT_DOCUMENT_REVIEW",
      metadata: { document_id: document.id, missing_fields: analysis.missingFields, official_url: feeSource?.official_url || null, renewal_url: portalUrl, owner_checkpoint_required: true },
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
  });

  await run("renewal_task", async () => {
    const { error } = await db.from("gov_renewal_tasks").upsert({
      id: renewalTaskId,
      tenant_id: context.tenantId,
      document_id: document.id,
      task_type: "RENEWAL_PREPARATION",
      title: `تجهيز ومتابعة ${analysis.title}`,
      due_date: dueDate,
      priority,
      status: document.status === "ACTIVE" ? "SCHEDULED" : "OPEN",
      fee_amount: feeSource?.fee_amount ?? null,
      fee_currency: feeSource?.fee_currency || "SAR",
      official_url: feeSource?.official_url || null,
      renewal_url: portalUrl,
      checklist,
      company_task_id: reviewTaskId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
  });

  await run("work_session", async () => {
    const { error } = await db.from("work_sessions").upsert({
      id: sessionId,
      tenant_id: context.tenantId,
      title: `إجراء حكومي: ${analysis.title}`,
      target_url: portalUrl,
      service_name: analysis.title,
      owner_name: "ماجد",
      request: "التحقق من المتطلبات وتجهيز البيانات دون تنفيذ اعتماد نهائي أو دفع.",
      status: "READY",
      prepared_fields: preparedFields,
      checklist,
      notes: "المالك يدخل نفاذ ورمز التحقق ويعتمد ويدفع ويرسل الطلب النهائي بنفسه.",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
  });

  await run("external_work_queue", async () => {
    const { error } = await db.from("external_work_queue").upsert({
      id: queueId,
      tenant_id: context.tenantId,
      title: `متابعة ${analysis.title}`,
      channel: analysis.issuer || "الجهة الحكومية",
      url: portalUrl,
      service: analysis.title,
      request: analysis.summary,
      fields: Object.fromEntries(preparedFields.map((item) => [item.label, item.value])),
      owner_id: employeeId,
      owner_name: "ماجد",
      status: "WAITING_OWNER",
      plan: "ماجد يفتح الرابط الرسمي ويجهز الحقول. يتوقف قبل نفاذ أو رمز التحقق أو الدفع أو الإرسال النهائي وينتظر المالك.",
      checklist,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
  });

  await run("notification", async () => {
    const { error } = await db.from("notifications").insert({
      id: `notif-gov-${document.id}-${Date.now()}`,
      tenant_id: context.tenantId,
      employee_id: employeeId,
      title: "وثيقة حكومية جديدة تحتاج متابعة",
      message: `${analysis.title}: ${analysis.summary}`,
      type: priority === "URGENT" ? "WARNING" : "TASK",
    });
    if (error) throw error;
  });

  if (priority === "URGENT" || analysis.missingFields.length || analysis.risks.some((risk) => ["HIGH", "CRITICAL"].includes(risk.level))) {
    await run("operational_alert", async () => {
      const { error } = await db.from("operational_alerts").upsert({
        tenant_id: context.tenantId,
        alert_key: `gov-document-${document.id}`,
        department: "government_relations",
        severity: priority === "URGENT" ? "HIGH" : "MEDIUM",
        title: `${analysis.title} تحتاج متابعة`,
        message: `${analysis.summary} الحقول الناقصة: ${analysis.missingFields.join("، ") || "لا يوجد"}.`,
        source_table: "gov_documents",
        source_id: document.id,
        action_url: "/departments/government-relations",
        due_date: dueDate,
        status: "OPEN",
        metadata: { document_id: document.id, review_task_id: reviewTaskId, owner_checkpoint_required: true },
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "alert_key" });
      if (error) throw error;
    });
  }

  return { reviewTaskId, renewalTaskId, sessionId, queueId, priority, dueDate, operations };
}

async function storeOriginalFile(context: GovernmentContext, documentId: string, input: GovernmentUploadInput, buffer: Buffer) {
  const db = supabase();
  await ensureBucket();
  const safeName = sanitizeFileName(input.fileName);
  const path = `${safeTenantPart(context.tenantId)}/${documentId}/${randomUUID()}-${safeName}`;
  const contentHash = hashFile(buffer);
  const uploaded = await db.storage.from(GOVERNMENT_BUCKET).upload(path, buffer, {
    contentType: input.mimeType || "application/octet-stream",
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;
  const { data, error } = await db.from("gov_document_files").insert({
    tenant_id: context.tenantId,
    document_id: documentId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    file_size: buffer.length,
    storage_bucket: GOVERNMENT_BUCKET,
    storage_path: path,
    file_category: "ORIGINAL",
    version_no: 1,
    is_current: true,
    content_hash: contentHash,
  }).select().single();
  if (error) {
    await db.storage.from(GOVERNMENT_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

async function persistExtraction(context: GovernmentContext, documentId: string, result: AnalysisResult) {
  const db = supabase();
  const { data, error } = await db.from("gov_document_extractions").insert({
    tenant_id: context.tenantId,
    document_id: documentId,
    extraction_engine: result.engine,
    model_name: result.model,
    latency_ms: result.latencyMs,
    error_message: result.error,
    raw_text: "",
    extracted_json: { ...result.analysis, analysisError: result.error },
    confidence: result.analysis.confidence,
    status: result.analysis.missingFields.length || result.error ? "NEEDS_REVIEW" : "EXTRACTED",
  }).select().single();
  if (error) throw error;
  return data;
}

export async function uploadAndAutomateGovernmentDocument(context: GovernmentContext, input: GovernmentUploadInput) {
  const buffer = validateUpload(input);
  const db = supabase();
  await ensureDepartment(context);
  const analysisResult = await analyzeWithOpenAI(input);
  const analysis = analysisResult.analysis;
  const feeSource = await feeSourceFor(context.tenantId, analysis.documentType);
  const status = documentStatus(analysis.expiryDate, analysis.missingFields);
  const { data: document, error: documentError } = await db.from("gov_documents").insert({
    tenant_id: context.tenantId,
    document_type: analysis.documentType,
    title: analysis.title,
    document_number: analysis.documentNumber || null,
    issuer: analysis.issuer || feeSource?.issuer || null,
    owner_name: analysis.ownerName || null,
    tax_number: analysis.taxNumber || null,
    start_date: analysis.startDate || null,
    expiry_date: analysis.expiryDate || null,
    renewal_date: analysis.renewalDate || null,
    city: analysis.city || null,
    activity: analysis.activity || null,
    status,
    official_url: feeSource?.official_url || null,
    renewal_url: feeSource?.renewal_url || null,
    fee_amount: feeSource?.fee_amount ?? null,
    fee_currency: feeSource?.fee_currency || "SAR",
    fee_text: feeSource?.fee_text || null,
    extracted_data: { ...analysis, analysisError: analysisResult.error },
    missing_fields: analysis.missingFields,
    extraction_confidence: analysis.confidence,
    notes: input.notes || null,
    analysis_status: analysisResult.error || analysis.missingFields.length ? "NEEDS_REVIEW" : "COMPLETED",
    analysis_engine: analysisResult.engine,
    analysis_error: analysisResult.error,
    analyzed_at: new Date().toISOString(),
    automation_status: "PENDING",
    last_verified_at: new Date().toISOString(),
  }).select().single();
  if (documentError) throw documentError;

  let file: any = null;
  let extraction: any = null;
  try {
    file = await storeOriginalFile(context, document.id, input, buffer);
    extraction = await persistExtraction(context, document.id, analysisResult);
  } catch (error) {
    await db.from("gov_documents").delete().eq("tenant_id", context.tenantId).eq("id", document.id);
    throw new Error(`تعذر حفظ الوثيقة الأصلية: ${error instanceof Error ? error.message : String(error)}`);
  }

  const automation = await createFollowUpAutomation(context, document, analysis, feeSource);
  const automationFailed = automation.operations.filter((item) => !item.ok);
  const { data: finalDocument, error: finalError } = await db.from("gov_documents").update({
    automation_status: automationFailed.length ? "PARTIAL" : "COMPLETED",
    automation_summary: automation,
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", context.tenantId).eq("id", document.id).select().single();
  if (finalError) throw finalError;

  try {
    const event = createCompanyEvent({
      type: "government.document.processed",
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorType: "HUMAN",
      entityType: "gov_document",
      entityId: document.id,
      correlationId: context.correlationId || randomUUID(),
      payload: {
        documentType: analysis.documentType,
        analysisStatus: finalDocument.analysis_status,
        automationStatus: finalDocument.automation_status,
        fileId: file.id,
        taskId: automation.reviewTaskId,
        ownerCheckpointRequired: true,
      },
    });
    await appendCompanyEvent(event);
  } catch {
    // Event delivery cannot invalidate a safely persisted government document.
  }

  return { document: finalDocument, file, extraction, analysis, automation, feeSource };
}

export async function getGovernmentRelationsDashboard(context: GovernmentContext) {
  const db = supabase();
  const { departmentId, employeeId } = await ensureDepartment(context);
  const [documents, files, extractions, tasks, renewalTasks, sessions, queue] = await Promise.all([
    db.from("gov_documents").select("*").eq("tenant_id", context.tenantId).order("created_at", { ascending: false }).limit(100),
    db.from("gov_document_files").select("id,tenant_id,document_id,file_name,mime_type,file_size,storage_bucket,storage_path,version_no,is_current,content_hash,created_at").eq("tenant_id", context.tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("gov_document_extractions").select("id,tenant_id,document_id,extraction_engine,model_name,latency_ms,error_message,extracted_json,confidence,status,created_at").eq("tenant_id", context.tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("tasks").select("*").eq("tenant_id", context.tenantId).eq("department_id", departmentId).order("created_at", { ascending: false }).limit(200),
    db.from("gov_renewal_tasks").select("*").eq("tenant_id", context.tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("work_sessions").select("*").eq("tenant_id", context.tenantId).eq("owner_name", "ماجد").order("created_at", { ascending: false }).limit(100),
    db.from("external_work_queue").select("*").eq("tenant_id", context.tenantId).eq("owner_id", employeeId).order("created_at", { ascending: false }).limit(100),
  ]);
  for (const result of [documents, files, extractions, tasks, renewalTasks, sessions, queue]) {
    if (result.error) throw result.error;
  }
  const fileRows = files.data || [];
  const extractionRows = extractions.data || [];
  const taskRows = tasks.data || [];
  const renewalRows = renewalTasks.data || [];
  const enriched = (documents.data || []).map((document: any) => ({
    ...document,
    current_file: fileRows.find((file: any) => file.document_id === document.id && file.is_current) || fileRows.find((file: any) => file.document_id === document.id) || null,
    latest_extraction: extractionRows.find((item: any) => item.document_id === document.id) || null,
    tasks: taskRows.filter((task: any) => task.source_id === document.id),
    renewal_tasks: renewalRows.filter((task: any) => task.document_id === document.id),
  }));
  return {
    documents: enriched,
    files: fileRows,
    extractions: extractionRows,
    companyTasks: taskRows,
    tasks: renewalRows,
    workSessions: sessions.data || [],
    externalWorkQueue: queue.data || [],
    operator: { id: employeeId, name: "ماجد", title: "مسؤول العلاقات الحكومية", departmentId },
    metrics: {
      totalDocuments: enriched.length,
      analyzedDocuments: enriched.filter((doc: any) => doc.analysis_status === "COMPLETED").length,
      needsReview: enriched.filter((doc: any) => doc.analysis_status === "NEEDS_REVIEW" || doc.status === "NEEDS_REVIEW").length,
      storedFiles: fileRows.length,
      openTasks: taskRows.filter((task: any) => !["DONE", "ARCHIVED"].includes(task.status)).length,
      ownerCheckpoints: (queue.data || []).filter((item: any) => item.status === "WAITING_OWNER").length,
    },
  };
}

export async function reanalyzeGovernmentDocument(context: GovernmentContext, documentId: string) {
  const db = supabase();
  const { data: document, error: documentError } = await db.from("gov_documents").select("*").eq("tenant_id", context.tenantId).eq("id", documentId).maybeSingle();
  if (documentError) throw documentError;
  if (!document) throw new Error("الوثيقة غير موجودة في هذه الشركة.");
  const { data: file, error: fileError } = await db.from("gov_document_files").select("*").eq("tenant_id", context.tenantId).eq("document_id", documentId).eq("is_current", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (fileError) throw fileError;
  if (!file?.storage_path) throw new Error("لا يوجد ملف أصلي محفوظ لإعادة التحليل.");
  const downloaded = await db.storage.from(file.storage_bucket || GOVERNMENT_BUCKET).download(file.storage_path);
  if (downloaded.error) throw downloaded.error;
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  const input: GovernmentUploadInput = {
    documentType: document.document_type,
    title: document.title,
    issuer: document.issuer,
    notes: document.notes || "",
    fileName: file.file_name,
    mimeType: file.mime_type || "application/octet-stream",
    fileBase64: buffer.toString("base64"),
  };
  const result = await analyzeWithOpenAI(input);
  const analysis = result.analysis;
  const feeSource = await feeSourceFor(context.tenantId, analysis.documentType);
  const status = documentStatus(analysis.expiryDate, analysis.missingFields);
  const { data: updated, error: updateError } = await db.from("gov_documents").update({
    document_type: analysis.documentType,
    title: analysis.title,
    document_number: analysis.documentNumber || null,
    issuer: analysis.issuer || feeSource?.issuer || null,
    owner_name: analysis.ownerName || null,
    tax_number: analysis.taxNumber || null,
    start_date: analysis.startDate || null,
    expiry_date: analysis.expiryDate || null,
    renewal_date: analysis.renewalDate || null,
    city: analysis.city || null,
    activity: analysis.activity || null,
    status,
    extracted_data: { ...analysis, analysisError: result.error },
    missing_fields: analysis.missingFields,
    extraction_confidence: analysis.confidence,
    analysis_status: result.error || analysis.missingFields.length ? "NEEDS_REVIEW" : "COMPLETED",
    analysis_engine: result.engine,
    analysis_error: result.error,
    analyzed_at: new Date().toISOString(),
    automation_status: "PENDING",
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", context.tenantId).eq("id", documentId).select().single();
  if (updateError) throw updateError;
  const extraction = await persistExtraction(context, documentId, result);
  const automation = await createFollowUpAutomation(context, updated, analysis, feeSource);
  const failed = automation.operations.filter((item) => !item.ok);
  const final = await db.from("gov_documents").update({ automation_status: failed.length ? "PARTIAL" : "COMPLETED", automation_summary: automation, updated_at: new Date().toISOString() }).eq("tenant_id", context.tenantId).eq("id", documentId).select().single();
  if (final.error) throw final.error;
  return { document: final.data, extraction, analysis, automation };
}

export async function createGovernmentFilePreview(context: GovernmentContext, fileId: string) {
  const db = supabase();
  const { data: file, error } = await db.from("gov_document_files").select("*").eq("tenant_id", context.tenantId).eq("id", fileId).maybeSingle();
  if (error) throw error;
  if (!file?.storage_path) throw new Error("الملف غير موجود في هذه الشركة.");
  const signed = await db.storage.from(file.storage_bucket || GOVERNMENT_BUCKET).createSignedUrl(file.storage_path, 15 * 60);
  if (signed.error) throw signed.error;
  await db.from("gov_document_access_logs").insert({
    tenant_id: context.tenantId,
    document_id: file.document_id,
    file_id: file.id,
    actor_role: context.actorRole,
    action: "SIGNED_PREVIEW_CREATED",
    metadata: { expires_in_seconds: 900 },
  });
  return { signedUrl: signed.data.signedUrl, expiresIn: 900, fileName: file.file_name };
}

export async function assertGovernmentEntityTenant(context: GovernmentContext, table: string, idColumn: string, id: string) {
  const allowed = new Set(["gov_documents", "gov_document_files", "gov_renewal_tasks", "gov_regulatory_updates"]);
  if (!allowed.has(table)) throw new Error("Invalid government entity table.");
  const db = supabase();
  const { data, error } = await db.from(table).select(idColumn).eq("tenant_id", context.tenantId).eq(idColumn, id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("العنصر غير موجود في هذه الشركة.");
}
