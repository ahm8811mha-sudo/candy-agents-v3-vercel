import type { ExecutiveRole, GovernancePolicy, RiskLevel } from "./types";

export const RISK_POLICIES: Record<RiskLevel, GovernancePolicy> = {
  LOW: {
    level: "LOW",
    description: "إجراء داخلي منخفض الأثر، قابل للعكس، ولا ينشئ التزاماً مادياً أو قانونياً.",
    examples: [
      "إنشاء تقرير داخلي",
      "إعادة ترتيب مهمة",
      "إنشاء مستند أولي",
      "تجربة داخلية تقل عن 5,000 ريال",
    ],
    approvers: [],
    controls: [
      "التحقق من الميزانية المتاحة",
      "تنفيذ عبر موصل معتمد",
      "إثبات نتيجة التنفيذ",
      "إمكانية التراجع",
      "تسجيل تدقيق إلزامي",
    ],
    requiredDocumentation: ["سجل الإجراء", "النتيجة المتوقعة", "دليل التنفيذ"],
    maximumAutomaticCommitmentSAR: 5_000,
  },
  MEDIUM: {
    level: "MEDIUM",
    description: "إجراء له أثر على عميل أو مورد أو ميزانية تشغيلية محدودة.",
    examples: [
      "التواصل مع العملاء",
      "حملة تسويقية محدودة",
      "طلب مورد",
      "التزام بين 5,000 و25,000 ريال",
    ],
    approvers: ["CEO"],
    controls: [
      "مراجعة ثنائية للبيانات",
      "معاينة قبل التنفيذ",
      "حجز مالي مسبق",
      "قياس النتيجة بعد التنفيذ",
      "انتهاء صلاحية الموافقة",
    ],
    requiredDocumentation: ["مذكرة قرار", "مصادر الأدلة", "الأثر المالي", "مالك النتيجة"],
    maximumAutomaticCommitmentSAR: 0,
  },
  HIGH: {
    level: "HIGH",
    description: "إجراء مادي أو حساس قد يؤثر على الإيرادات أو العقود أو عدد كبير من العملاء.",
    examples: [
      "تعديل سعر واسع",
      "التزام تعاقدي",
      "عملية بيانات حساسة",
      "التزام بين 25,000 و250,000 ريال",
    ],
    approvers: ["CEO", "CFO", "CRO"],
    controls: [
      "فصل الاقتراح عن الاعتماد",
      "مراجعة قانونية أو مالية حسب المجال",
      "خطة تراجع أو تعويض",
      "محاكاة قبل التنفيذ",
      "مراجعة ما بعد التنفيذ",
    ],
    requiredDocumentation: [
      "حزمة قرار كاملة",
      "تحليل السيناريو السلبي",
      "خطة تخفيف المخاطر",
      "رأي معارض مستقل",
      "خطة تراجع",
    ],
    maximumAutomaticCommitmentSAR: 0,
  },
  CRITICAL: {
    level: "CRITICAL",
    description: "إجراء لا رجعة فيه أو يؤثر على استمرارية الشركة أو سمعتها أو التزاماتها النظامية.",
    examples: [
      "تحويل بنكي كبير",
      "التزام قانوني جوهري",
      "إيداع نظامي",
      "حادث أمني",
      "التزام يتجاوز 250,000 ريال",
    ],
    approvers: ["OWNER", "CEO", "CFO", "CRO"],
    controls: [
      "اعتماد بشري صريح",
      "تفويض مزدوج",
      "قناة حادثة منفصلة",
      "دليل غير قابل للتعديل",
      "مراجعة مجلسية لاحقة",
      "منع التنفيذ الآلي الكامل",
    ],
    requiredDocumentation: [
      "محضر قرار مجلسي",
      "الرأي القانوني أو النظامي",
      "الأثر المالي الكامل",
      "خطة استمرارية الأعمال",
      "خطة اتصالات",
    ],
    maximumAutomaticCommitmentSAR: 0,
  },
};

export type RiskClassificationInput = {
  commitmentSAR?: number;
  customerFacing?: boolean;
  legalCommitment?: boolean;
  regulatoryAction?: boolean;
  sensitiveData?: boolean;
  securityImpact?: boolean;
  irreversible?: boolean;
  affectsManyCustomers?: boolean;
  threatensContinuity?: boolean;
};

export function classifyRisk(input: RiskClassificationInput): RiskLevel {
  const amount = Math.max(0, Number(input.commitmentSAR || 0));

  if (
    input.regulatoryAction ||
    input.securityImpact ||
    input.threatensContinuity ||
    (input.legalCommitment && input.irreversible) ||
    amount > 250_000
  ) {
    return "CRITICAL";
  }

  if (
    input.legalCommitment ||
    input.sensitiveData ||
    input.affectsManyCustomers ||
    input.irreversible ||
    amount > 25_000
  ) {
    return "HIGH";
  }

  if (input.customerFacing || amount > 5_000) return "MEDIUM";
  return "LOW";
}

export function approvalRoute(level: RiskLevel): ExecutiveRole[] {
  return [...RISK_POLICIES[level].approvers];
}

export function mayAutoExecute(level: RiskLevel, commitmentSAR = 0) {
  const policy = RISK_POLICIES[level];
  return level === "LOW" && commitmentSAR <= policy.maximumAutomaticCommitmentSAR;
}

export function validateDecisionSeparation(input: {
  recommenderRole?: ExecutiveRole;
  approverRoles: ExecutiveRole[];
  riskLevel: RiskLevel;
}) {
  if (input.riskLevel === "LOW") return { valid: true, reason: "Low-risk actions may execute under policy." };
  if (!input.recommenderRole) return { valid: false, reason: "Material decisions require an identified recommender." };
  if (input.approverRoles.includes(input.recommenderRole)) {
    return { valid: false, reason: "The same executive cannot recommend and solely approve a material decision." };
  }
  return { valid: true, reason: "Recommendation and approval duties are separated." };
}
