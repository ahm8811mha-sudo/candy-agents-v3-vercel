/**
 * Arabic names for the codes the server reports (`HIGH`, `CEO`, `PROFITABLE`,
 * `IN_PROGRESS`), so a raw code never reaches the screen. An unknown code is
 * shown as it came, which keeps a new server value visible instead of blank.
 */
const RISK: Record<string, string> = { LOW: "منخفضة", MEDIUM: "متوسطة", HIGH: "مرتفعة", CRITICAL: "حرجة" };
const APPROVAL_GATE: Record<string, string> = { AUTO: "تلقائي ضمن الحدود", CEO: "الرئيس التنفيذي", OWNER: "المالك", RISK: "وكيل المخاطر" };
const FINANCIAL_STATE: Record<string, string> = { PROFITABLE: "رابح", LOSS_MAKING: "خاسر", READY: "جاهز" };
const WORK_STATUS: Record<string, string> = {
  TODO: "لم تبدأ", QUEUED: "في الانتظار", PENDING: "معلّق", IN_PROGRESS: "قيد التنفيذ", RUNNING: "قيد التشغيل",
  REVIEW: "قيد المراجعة", BLOCKED: "متوقف", ON_HOLD: "موقوف", DONE: "مكتمل", COMPLETED: "مكتمل", ARCHIVED: "مؤرشف",
  ACTIVE: "نشط", READY: "جاهز", WAITING_APPROVAL: "بانتظار الاعتماد", PENDING_APPROVAL: "بانتظار الاعتماد",
  WAITING_FUNDING: "بانتظار اعتماد التمويل", APPROVED: "معتمد", REJECTED: "مرفوض", FAILED: "فشل", CANCELLED: "ملغى",
  INTERNAL: "داخلي", READY_FOR_INTEGRATION: "جاهز للربط", SUCCESS: "ناجح", PROMISING: "واعد", WATCH: "تحت المراقبة",
  ON_TRACK: "على المسار", AT_RISK: "معرّض للخطر", OFF_TRACK: "خارج المسار",
  NEW: "جديد", CONTACTED: "تم التواصل", QUALIFIED: "مؤهل", OPEN: "مفتوحة", DISCOVERY: "استكشاف", PROPOSAL: "عرض",
  NEGOTIATION: "تفاوض", WON: "رابحة", LOST: "خاسرة", DRAFT: "مسودة", SENT: "مُرسل", ACCEPTED: "مقبول", EXPIRED: "منتهٍ",
  RECEIVED: "وارد", READY_FOR_CONNECTION: "جاهز للربط", AWARENESS: "الوعي", DEMAND_CREATION: "صناعة الطلب",
  DEMAND_CAPTURE: "التقاط الطلب", CONVERSION: "التحويل", RETENTION: "الاحتفاظ",
  ASSET: "أصول", LIABILITY: "التزامات", EQUITY: "حقوق ملكية", REVENUE: "إيرادات", EXPENSE: "مصروفات", SALES: "مبيعات",
  PURCHASE: "مشتريات", POSTED: "مرحّل", ISSUED: "صادرة", PAID: "مدفوعة", MATCHED: "مطابق", UNMATCHED: "غير مطابق",
  CLOSED: "مقفل", BASE: "أساسي", TESTING: "قيد الاختبار", SUBMITTED: "مُقدّم", RESOLVED: "تمت معالجته",
  PENDING_GOVERNANCE: "بانتظار الحوكمة", WAITING_OWNER: "بانتظار المالك", SKIPPED_RECENTLY: "تُخطّي مؤخراً",
};
const ENTITY: Record<string, string> = {
  decision: "قرار", decision_commitment: "التزام قرار", project: "مشروع", task: "مهمة", business_action: "إجراء تجاري",
  income: "اعتماد مداخيل", marketing_campaigns: "حملة تسويقية", inventory_item: "صنف مخزون", gov_document: "وثيقة حكومية",
  gov_documents: "وثيقة حكومية", accounting_period_closes: "إقفال فترة محاسبية", accounting_bank_transactions: "حركة بنكية",
  company_execution: "تنفيذ الشركة", workflow: "مسار عمل", report: "تقرير",
};

function label(names: Record<string, string>, code: unknown, missing: string, normalise = (raw: string) => raw.toUpperCase()): string {
  const raw = String(code ?? "").trim();
  if (!raw) return missing;
  return names[normalise(raw)] || raw;
}

export const riskLabel = (level: unknown) => label(RISK, level, "غير محددة");
export const approvalGateLabel = (gate: unknown) => label(APPROVAL_GATE, gate, "غير محدد");
export const financialStateLabel = (status: unknown) => label(FINANCIAL_STATE, status, "جاهز");
export const workStatusLabel = (status: unknown) => label(WORK_STATUS, status, "غير محدد");
export const entityLabel = (entityType: unknown) => label(ENTITY, entityType, "طلب اعتماد", (raw) => raw.toLowerCase());
