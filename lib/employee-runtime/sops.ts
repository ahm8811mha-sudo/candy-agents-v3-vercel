export type EmployeeSop = {
  id: string;
  title: string;
  ownerEmployeeId: string;
  backupEmployeeId: string;
  trigger: string;
  objective: string;
  requiredInputs: string[];
  steps: string[];
  acceptanceCriteria: string[];
  controls: string[];
  kpiIds: string[];
};

export const EMPLOYEE_SOPS: EmployeeSop[] = [
  {
    id: "SOP-OTC-001",
    title: "البيع إلى التحصيل",
    ownerEmployeeId: "sara",
    backupEmployeeId: "noura",
    trigger: "طلب بيع مدفوع أو طلب يدوي بمرجع دفع",
    objective:
      "تسجيل البيع والفاتورة والمخزون والتجهيز وCRM وقياس الهامش دون تكرار.",
    requiredInputs: [
      "orderId",
      "paymentReference",
      "customer",
      "sku",
      "quantity",
      "amountSAR",
    ],
    steps: [
      "التحقق من الطلب ومرجع الدفع",
      "تسجيل عملية البيع",
      "إنشاء فاتورة البيع والقيد",
      "حجز المخزون",
      "إنشاء أمر التجهيز",
      "تحديث CRM",
      "فحص هامش الربح",
      "تسجيل KPI وإيصال التنفيذ",
    ],
    acceptanceCriteria: [
      "لا يتكرر الطلب أو القيد",
      "كل خطوة تحمل مرجعًا وإيصالًا",
      "انخفاض الهامش يتحول إلى استثناء",
    ],
    controls: [
      "idempotency",
      "payment-reference",
      "balanced-entry",
      "inventory-lock",
      "execution-receipt",
    ],
    kpiIds: ["order_to_cash_success", "order_error_rate"],
  },
  {
    id: "SOP-P2P-001",
    title: "الشراء إلى السداد",
    ownerEmployeeId: "khalid",
    backupEmployeeId: "fahad",
    trigger: "طلب شراء مع مورد وصنف وكمية وسعر",
    objective:
      "تقييم المورد وإصدار أمر شراء واستلام المخزون وتسجيل الفاتورة وجدولة المستحق.",
    requiredInputs: [
      "requestId",
      "supplier",
      "sku",
      "quantity",
      "unitPriceSAR",
      "received",
    ],
    steps: [
      "تقييم المورد والعرض",
      "فحص الصلاحية المالية",
      "إنشاء أمر الشراء",
      "تأكيد الاستلام وفحص الجودة",
      "إضافة الكمية إلى المخزون ذريًا",
      "إنشاء فاتورة الشراء والقيد",
      "جدولة المستحق دون تحويل بنكي غير مصرح",
      "تسجيل KPI وإيصال التنفيذ",
    ],
    acceptanceCriteria: [
      "لا يصدر أمر شراء لمورد غير مؤهل",
      "الاستلام غير المؤكد لا يضاف للمخزون",
      "السداد مجدول فقط حتى يتوفر موصل بنكي محكوم",
    ],
    controls: [
      "authority-matrix",
      "supplier-score",
      "goods-receipt",
      "inventory-atomicity",
      "no-bank-transfer",
    ],
    kpiIds: ["purchase_to_pay_success", "inventory_accuracy"],
  },
  {
    id: "SOP-IDEA-001",
    title: "الفكرة إلى التنفيذ",
    ownerEmployeeId: "fahad",
    backupEmployeeId: "khalid",
    trigger: "فكرة معتمدة من مركز القرار",
    objective:
      "تحويل الفكرة المعتمدة إلى مشروع ومهام وKPIs وإجراءات وسجل تدقيق.",
    requiredInputs: ["ideaId", "approved", "budgetSAR", "riskLevel"],
    steps: [
      "التحقق من الاعتماد",
      "فحص الميزانية والمخاطر",
      "إنشاء المشروع",
      "إنشاء المهام والمسؤولين",
      "إنشاء مؤشرات الأداء",
      "إنشاء الإجراءات التنفيذية",
      "تسجيل الذاكرة والتدقيق والإيصال",
    ],
    acceptanceCriteria: [
      "لا تتحول فكرة غير معتمدة إلى مشروع",
      "التحويل غير مكرر",
      "كل مشروع يحمل رقمًا ومهام مرتبطة به",
    ],
    controls: [
      "approval-gate",
      "authority-matrix",
      "risk-gate",
      "execution-bundle-transaction",
    ],
    kpiIds: ["idea_to_execution_success", "company_goal_delivery"],
  },
  {
    id: "SOP-GOV-001",
    title: "فحص الصلاحيات قبل التنفيذ",
    ownerEmployeeId: "hares",
    backupEmployeeId: "majed",
    trigger: "قبل كل خطوة تنفيذية",
    objective: "منع أي موظف أو بديل من تجاوز قدرته أو حد المخاطر أو الصرف.",
    requiredInputs: ["employeeId", "capability", "amountSAR", "riskLevel"],
    steps: [
      "تأكيد القدرة",
      "تأكيد التفويض المؤقت إن وجد",
      "حساب T0-T3",
      "تطبيق سياسة غياب المالك",
      "السماح أو التصعيد",
    ],
    acceptanceCriteria: ["لا أداة تعمل قبل قرار السياسة"],
    controls: ["least-privilege", "temporary-delegation", "owner-gate"],
    kpiIds: ["unauthorized_action_count"],
  },
  {
    id: "SOP-CONTINUITY-001",
    title: "استمرارية العمل وبديل الموظف",
    ownerEmployeeId: "sultan",
    backupEmployeeId: "fahad",
    trigger: "غياب موظف أو المالك أو تعطل أحد الأقسام",
    objective: "استمرار الأعمال الروتينية دون منح صلاحيات دائمة للبديل.",
    requiredInputs: ["unavailableEmployeeIds", "workOrderId"],
    steps: [
      "تحديد الموظف الأصلي",
      "التحقق من البديل المسجل",
      "منح تفويض خطوة واحدة",
      "تسجيل التفويض في الإيصال",
      "الحفاظ على حدود الدور الأصلي",
    ],
    acceptanceCriteria: [
      "لا ينفذ بديل غير مسجل",
      "لا ترتفع صلاحية الدور بسبب التفويض",
    ],
    controls: ["configured-backup", "single-step-delegation", "audit"],
    kpiIds: ["owner_intervention_rate", "first_time_success"],
  },
  {
    id: "SOP-EXCEPTION-001",
    title: "إدارة الاستثناء وإعادة المحاولة",
    ownerEmployeeId: "sultan",
    backupEmployeeId: "fahad",
    trigger: "فشل أداة أو تحقق أو تسوية أو انحراف KPI",
    objective: "إعادة المحاولة بأمان ثم تصعيد الاستثناء دون إخفائه.",
    requiredInputs: ["workOrderId", "stepId", "error", "attempts"],
    steps: [
      "تسجيل الخطأ",
      "إعادة المحاولة حتى الحد",
      "إيقاف الدورة عند نفاد المحاولات",
      "رفع الاستثناء للمسؤول الصحيح",
      "الاستئناف من الخطوة غير المكتملة فقط",
    ],
    acceptanceCriteria: ["لا تتكرر الخطوات المكتملة", "لا يتحول الفشل إلى DONE"],
    controls: ["max-attempts", "idempotency", "resume", "escalation"],
    kpiIds: ["first_time_success", "evidence_completion_rate"],
  },
];

const sopById = new Map(EMPLOYEE_SOPS.map((sop) => [sop.id, sop]));

export function getEmployeeSop(id: string): EmployeeSop | undefined {
  return sopById.get(id);
}

export function requireEmployeeSop(id: string): EmployeeSop {
  const sop = getEmployeeSop(id);
  if (!sop) throw new Error(`Unknown employee SOP: ${id}`);
  return sop;
}
