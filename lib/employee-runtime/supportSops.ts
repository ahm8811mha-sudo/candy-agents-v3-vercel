import type { EmployeeSop } from "./sops";

const supportSop = (
  id: string,
  title: string,
  ownerEmployeeId: string,
  backupEmployeeId: string,
  objective: string,
  steps: string[],
  controls: string[],
  kpiIds: string[]
): EmployeeSop => ({
  id,
  title,
  ownerEmployeeId,
  backupEmployeeId,
  trigger: "طلب مباشر أو حدث تشغيلي أو مراجعة مجدولة",
  objective,
  requiredInputs: ["workOrderId", "tenantId", "businessContext"],
  steps,
  acceptanceCriteria: [
    "المدخلات موثقة",
    "الصلاحيات مفحوصة",
    "المخرج قابل للقياس",
    "التنفيذ أو التصعيد مسجل بإيصال",
  ],
  controls,
  kpiIds,
});

export const SUPPORT_EMPLOYEE_SOPS: EmployeeSop[] = [
  supportSop(
    "SOP-EXEC-001",
    "التوجيه التنفيذي وتوزيع العمل",
    "sultan",
    "fahad",
    "تحويل الهدف الاستراتيجي إلى أوامر عمل موزعة على أصحاب الاختصاص.",
    [
      "تحديد النتيجة المطلوبة",
      "تقسيمها إلى مسارات",
      "تعيين الموظف والبديل",
      "تحديد الاعتماد وKPI",
      "متابعة الاستثناءات",
    ],
    ["segregation-of-duties", "authority-matrix", "exception-only"],
    ["company_goal_delivery", "owner_intervention_rate"]
  ),
  supportSop(
    "SOP-FIN-001",
    "إعداد الميزانية وضبط الصرف",
    "abdulrahman",
    "ameen",
    "إدارة ميزانيات المشاريع ومنع تجاوز السقف المعتمد.",
    [
      "قراءة الميزانية المعتمدة",
      "تصنيف التكلفة",
      "فحص السيولة",
      "مقارنة الفعلي بالمستهدف",
      "إيقاف أو تصعيد الانحراف",
    ],
    ["budget-cap", "cash-check", "variance-alert"],
    ["budget_variance", "forecast_accuracy"]
  ),
  supportSop(
    "SOP-FIN-002",
    "التسوية والإقفال المالي",
    "abdulrahman",
    "ameen",
    "مطابقة الحركات بالمصادر وإصدار نتيجة مالية موثوقة.",
    [
      "جمع الحركات",
      "مطابقة المراجع",
      "حصر الاستثناءات",
      "اعتماد التصحيحات",
      "إقفال الفترة وإصدار التقرير",
    ],
    ["reconciliation", "period-lock", "audit-trail"],
    ["forecast_accuracy", "duplicate_entry_rate"]
  ),
  supportSop(
    "SOP-ACC-001",
    "تسجيل القيود والفواتير",
    "ameen",
    "abdulrahman",
    "إنشاء قيود متوازنة غير مكررة مرتبطة بالمصدر والمشروع.",
    [
      "التحقق من المستند",
      "تحديد الحسابات",
      "إنشاء الفاتورة",
      "إنشاء القيد المتوازن",
      "حفظ مفتاح منع التكرار",
    ],
    ["double-entry", "idempotency", "source-reference"],
    ["balanced_entry_rate", "duplicate_entry_rate"]
  ),
  supportSop(
    "SOP-ACC-002",
    "مراجعة جودة الدفتر",
    "ameen",
    "abdulrahman",
    "اكتشاف القيود غير المتوازنة أو غير المرتبطة بمصدر وتصعيدها.",
    [
      "فحص التوازن",
      "فحص المرجع",
      "فحص المشروع ومركز التكلفة",
      "إنشاء قائمة الاستثناءات",
      "تصحيح معتمد",
    ],
    ["ledger-integrity", "exception-log", "approved-correction"],
    ["balanced_entry_rate"]
  ),
  supportSop(
    "SOP-MKT-001",
    "تصميم الحملة التسويقية",
    "noura",
    "sara",
    "تحويل الهدف التجاري إلى فرضية وجمهور وعرض وميزانية اختبار.",
    [
      "تحديد الهدف",
      "تحديد الشريحة",
      "صياغة العرض",
      "تحديد قناة الاختبار",
      "تحديد KPI وحد الإيقاف",
    ],
    ["test-budget", "audience-consent", "stop-loss"],
    ["roas", "cac"]
  ),
  supportSop(
    "SOP-MKT-002",
    "تحسين وإيقاف الحملات",
    "noura",
    "sara",
    "رفع العائد وإيقاف الإنفاق غير المجدي وفق بيانات فعلية.",
    [
      "قراءة التكلفة والتحويل",
      "حساب ROAS وCAC",
      "مقارنة الحد",
      "تحسين أو إيقاف",
      "تسجيل القرار والنتيجة",
    ],
    ["measured-outcome", "spend-limit", "pause-control"],
    ["roas", "cac"]
  ),
  supportSop(
    "SOP-OPS-001",
    "إنشاء المشروع والمهام",
    "fahad",
    "khalid",
    "تحويل القرار إلى نطاق ومهام ومسؤولين ومواعيد ومعايير قبول.",
    [
      "تثبيت النطاق",
      "إنشاء المشروع",
      "تقسيم المهام",
      "تعيين المسؤول والبديل",
      "تحديد الموعد وKPI",
    ],
    ["scope-lock", "owner-per-task", "acceptance-criteria"],
    ["on_time_delivery", "first_time_success"]
  ),
  supportSop(
    "SOP-OPS-002",
    "إدارة التنفيذ والجودة",
    "fahad",
    "khalid",
    "متابعة التسليم وحل العوائق ومنع إغلاق المهمة دون تحقق.",
    [
      "متابعة الحالة",
      "كشف التأخير",
      "حل العائق أو تصعيده",
      "فحص الجودة",
      "إغلاق بإيصال",
    ],
    ["quality-gate", "delay-alert", "verified-done"],
    ["on_time_delivery", "first_time_success"]
  ),
  supportSop(
    "SOP-SALES-001",
    "إدارة مسار البيع",
    "sara",
    "noura",
    "تحويل الفرصة إلى طلب موثق ومتابعة الحالة دون فقد العميل.",
    [
      "تسجيل الفرصة",
      "تأهيل العميل",
      "تقديم العرض",
      "تأكيد الطلب والدفع",
      "تسليم الحدث لدورة البيع",
    ],
    ["crm-record", "approved-price", "payment-reference"],
    ["conversion_rate", "order_error_rate"]
  ),
  supportSop(
    "SOP-CRM-001",
    "تحديث العميل والمتابعة",
    "sara",
    "noura",
    "حفظ سجل موحد للعميل والطلبات والقيمة والتواصل التالي.",
    [
      "تحديد هوية العميل",
      "منع السجل المكرر",
      "تحديث الطلب والقيمة",
      "تحديد المتابعة",
      "قياس الاحتفاظ",
    ],
    ["customer-key", "deduplication", "consent"],
    ["conversion_rate"]
  ),
  supportSop(
    "SOP-PROC-001",
    "اختيار المورد وإصدار أمر الشراء",
    "khalid",
    "fahad",
    "اختيار مورد مؤهل بسعر ومدة وجودة واضحة قبل الالتزام.",
    [
      "جمع العروض",
      "تقييم السعر والمدة والجودة",
      "فحص الصلاحية المالية",
      "إصدار أمر الشراء",
      "متابعة الاستلام",
    ],
    ["supplier-score", "authority-gate", "purchase-idempotency"],
    ["inventory_accuracy", "stockout_rate"]
  ),
  supportSop(
    "SOP-INV-001",
    "إدارة المخزون",
    "khalid",
    "fahad",
    "حفظ رصيد دقيق وحجوزات ذرية وتنبيه إعادة الطلب.",
    [
      "تسجيل الصنف",
      "تحديث الاستلام",
      "حجز الكمية",
      "منع الرصيد السالب",
      "إطلاق تنبيه إعادة الطلب",
    ],
    ["atomic-reservation", "non-negative-stock", "reorder-point"],
    ["inventory_accuracy", "stockout_rate"]
  ),
  supportSop(
    "SOP-COMP-001",
    "فحص الامتثال قبل التنفيذ",
    "majed",
    "hares",
    "منع إجراء يخالف ترخيصًا أو سياسة أو متطلبًا نظاميًا.",
    [
      "تصنيف الإجراء",
      "تحديد المتطلبات",
      "فحص الترخيص والسياسة",
      "السماح أو الحجب",
      "تسجيل الدليل",
    ],
    ["regulatory-check", "license-check", "evidence"],
    ["compliance_breach_count"]
  ),
  supportSop(
    "SOP-COMP-002",
    "التراخيص والتجديدات",
    "majed",
    "hares",
    "تتبع تواريخ الانتهاء وإنشاء مهام التجديد قبل التعطل.",
    [
      "حصر التراخيص",
      "حساب المدة المتبقية",
      "إنشاء مهمة التجديد",
      "متابعة المستندات",
      "إغلاق بعد التحقق",
    ],
    ["expiry-alert", "renewal-task", "verified-renewal"],
    ["license_on_time_rate"]
  ),
  supportSop(
    "SOP-GOV-002",
    "التحقق من الإيصالات وسجل التدقيق",
    "hares",
    "majed",
    "منع حالة DONE دون دليل تنفيذ ومطابقة قابلة للمراجعة.",
    [
      "فحص مرجع الأداة",
      "فحص hash المدخلات",
      "فحص نتيجة التحقق",
      "فحص التسوية",
      "حفظ الحدث والإيصال",
    ],
    ["receipt-required", "input-hash", "reconciliation"],
    ["evidence_completion_rate", "unauthorized_action_count"]
  ),
];
