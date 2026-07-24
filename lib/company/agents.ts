/**
 * Golden Star official agent registry — the single source of truth for the
 * company's org structure (docs/OPERATING_MODEL.md §2).
 *
 * Both the UI (/company) and the governance layer read from here, so the org
 * chart on screen and the authority checks in code can never drift apart.
 */

export type AgentRank = "OWNER" | "CEO" | "DEPARTMENT_HEAD" | "FUNCTIONAL";

export type CompanyAgent = {
  id: string;
  /** Arabic given name — the agent's "employee" identity. */
  name: string;
  title: string;
  rank: AgentRank;
  department: string;
  /** Route of the department console this agent operates. */
  href?: string;
  responsibilities: string[];
  /** Self-approval ceiling in SAR (T0 gate). 0 = cannot spend alone. */
  authorityLimitSAR: number;
  reportsTo: string | null;
};

export const COMPANY_AGENTS: CompanyAgent[] = [
  {
    id: "owner",
    name: "المالك",
    title: "مالك الشركة — السلطة العليا",
    rank: "OWNER",
    department: "الملكية",
    href: "/inbox",
    responsibilities: ["اعتماد الفئتين T2 وT3", "تعيين الاستراتيجية العامة", "الرقابة على سلطان"],
    authorityLimitSAR: Number.MAX_SAFE_INTEGER,
    reportsTo: null,
  },
  {
    id: "sultan",
    name: "سلطان",
    title: "الرئيس التنفيذي (CEO Agent)",
    rank: "CEO",
    department: "الإدارة التنفيذية",
    href: "/departments/executive",
    responsibilities: [
      "فرز الفرص وتوزيعها على الأقسام",
      "التوصية النهائية قبل رفعها للمالك",
      "اعتماد الفئة T1 (حتى 25,000 ر.س)",
      "الخلاصة اليومية للمالك",
    ],
    authorityLimitSAR: 25_000,
    reportsTo: "owner",
  },
  {
    id: "abdulrahman",
    name: "عبدالرحمن",
    title: "المدير المالي (CFO)",
    rank: "DEPARTMENT_HEAD",
    department: "المالية",
    href: "/departments/finance",
    responsibilities: [
      "دراسات الجدوى المالية",
      "إدارة الميزانيات وسقوف الصرف",
      "الإشراف على مكتب التداول ضمن حدود المخاطر",
    ],
    authorityLimitSAR: 5_000,
    reportsTo: "sultan",
  },
  {
    id: "noura",
    name: "نورة",
    title: "مديرة التسويق (CMO)",
    rank: "DEPARTMENT_HEAD",
    department: "التسويق",
    href: "/departments/marketing",
    responsibilities: ["تحليل السوق والطلب", "الجدوى التسويقية للفرص", "تخطيط الحملات وقياس عائدها"],
    authorityLimitSAR: 5_000,
    reportsTo: "sultan",
  },
  {
    id: "fahad",
    name: "فهد",
    title: "مدير العمليات (COO)",
    rank: "DEPARTMENT_HEAD",
    department: "العمليات",
    href: "/departments/operations",
    responsibilities: ["الجدوى التشغيلية", "تحويل القرار المعتمد إلى مشروع ومهام", "متابعة الإنجاز والجودة"],
    authorityLimitSAR: 5_000,
    reportsTo: "sultan",
  },
  {
    id: "sara",
    name: "سارة",
    title: "مديرة المبيعات وعلاقات العملاء (CRM)",
    rank: "DEPARTMENT_HEAD",
    department: "المبيعات",
    href: "/departments/sales",
    responsibilities: ["إدارة مسار البيع والعملاء", "تغذية الجدوى ببيانات الطلب الفعلي"],
    authorityLimitSAR: 5_000,
    reportsTo: "sultan",
  },
  {
    id: "khalid",
    name: "خالد",
    title: "مدير المشتريات وسلاسل الإمداد",
    rank: "DEPARTMENT_HEAD",
    department: "المشتريات",
    href: "/departments/procurement",
    responsibilities: ["الموردون وأوامر الشراء", "المخزون ونقاط إعادة الطلب", "تكلفة التوريد في الجدوى"],
    authorityLimitSAR: 5_000,
    reportsTo: "sultan",
  },
  {
    id: "majed",
    name: "ماجد",
    title: "مدير العلاقات الحكومية والامتثال",
    rank: "DEPARTMENT_HEAD",
    department: "العلاقات الحكومية",
    href: "/departments/government-relations",
    responsibilities: ["التراخيص والأنظمة", "فحص الامتثال لكل فرصة قبل الاعتماد"],
    authorityLimitSAR: 5_000,
    reportsTo: "sultan",
  },
  {
    id: "rased",
    name: "راصد",
    title: "محلل الفرص (Opportunity Radar)",
    rank: "FUNCTIONAL",
    department: "الاستخبارات",
    href: "/bi-center",
    responsibilities: ["مسح السوق باستمرار", "دفع الفرص الجديدة لمرحلة الفرز تلقائياً"],
    authorityLimitSAR: 0,
    reportsTo: "sultan",
  },
  {
    id: "ameen",
    name: "أمين",
    title: "المحاسب العام",
    rank: "FUNCTIONAL",
    department: "المحاسبة",
    href: "/departments/finance",
    responsibilities: ["تسجيل كل قيد (SAR)", "إسناد التكاليف للمشاريع", "القوائم والتقارير"],
    authorityLimitSAR: 0,
    reportsTo: "sultan",
  },
  {
    id: "hares",
    name: "حارس",
    title: "مسؤول المخاطر والحوكمة",
    rank: "FUNCTIONAL",
    department: "الحوكمة",
    href: "/inbox",
    responsibilities: ["فرض مصفوفة الصلاحيات", "سجل التدقيق", "إيقاف أي تجاوز لحدود المخاطر"],
    authorityLimitSAR: 0,
    reportsTo: "sultan",
  },
  {
    id: "diwan",
    name: "ريّان",
    title: "رئيس الديوان التنفيذي (Chief of Staff)",
    rank: "FUNCTIONAL",
    department: "الديوان التنفيذي",
    href: "/decisions-followup",
    responsibilities: [
      "التقاط كل قرار معتمد أو محال لحظة صدوره وتحويله إلى التزام متتبَّع",
      "إسناد مسؤول محدد وتاريخ استحقاق لكل قرار",
      "مطاردة المواعيد وتذكير المسؤولين وتصعيد المتأخر للمالك",
      "تأكيد إغلاق القرار بدليل ثم ربطه بما نفّذه فعلاً",
    ],
    authorityLimitSAR: 0,
    reportsTo: "sultan",
  },
];

export function getAgent(id: string): CompanyAgent | undefined {
  return COMPANY_AGENTS.find((a) => a.id === id);
}

export function getAgentsByRank(rank: AgentRank): CompanyAgent[] {
  return COMPANY_AGENTS.filter((a) => a.rank === rank);
}

export function getDirectReports(managerId: string): CompanyAgent[] {
  return COMPANY_AGENTS.filter((a) => a.reportsTo === managerId);
}
