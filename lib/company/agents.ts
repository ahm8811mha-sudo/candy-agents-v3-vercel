/**
 * Orvanta official agent registry: the single source of truth for the
 * company's org structure (docs/OPERATING_MODEL.md §2).
 *
 * Both the UI (/company) and the governance layer read from here, so the org
 * chart on screen and the authority checks in code can never drift apart.
 */

export type AgentRank = "OWNER" | "CEO" | "SECTOR_LEAD" | "DEPARTMENT_HEAD" | "FUNCTIONAL";

/** The rooms of the office floor: four sectors, the CEO office, and independent governance. */
export type CompanySector = "board" | "governance" | "executive" | "finance" | "operations" | "revenue" | "compliance";

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
  /** The floor room / sector this employee sits in. */
  sector: CompanySector;
  /** Self-approval ceiling in SAR (T0 gate). 0 = cannot spend alone. */
  authorityLimitSAR: number;
  reportsTo: string | null;
};

export const COMPANY_AGENTS: CompanyAgent[] = [
  {
    id: "owner",
    name: "المالك",
    title: "رئيس مجلس الإدارة",
    rank: "OWNER",
    department: "مجلس الإدارة",
    href: "/inbox",
    responsibilities: [
      "الاطلاع على اللوحات والتقارير والمذكرات وسجل التدقيق",
      "الاعتماد النهائي للصرف ولكل قرار مُصعَّد",
      "لا تُسند إليه مهام تشغيلية",
    ],
    authorityLimitSAR: Number.MAX_SAFE_INTEGER,
    sector: "board",
    reportsTo: null,
  },
  {
    id: "sultan",
    name: "سلطان",
    title: "الرئيس التنفيذي وعضو مجلس الإدارة",
    rank: "CEO",
    department: "الإدارة التنفيذية",
    href: "/departments/executive",
    responsibilities: [
      "إدارة الشركة وتوزيع العمل على الأقسام",
      "التوصية النهائية قبل رفعها لرئيس مجلس الإدارة",
      "لا يعتمد أي صرف",
      "الخلاصة اليومية لرئيس مجلس الإدارة",
    ],
    authorityLimitSAR: 0,
    sector: "executive",
    reportsTo: "owner",
  },
  {
    id: "abdulrahman",
    name: "عبدالرحمن",
    title: "قائد قطاع المالية",
    rank: "SECTOR_LEAD",
    department: "المالية",
    href: "/departments/finance",
    responsibilities: [
      "دراسات الجدوى المالية",
      "إدارة الميزانيات وسقوف الصرف",
      "الإشراف على مكتب التداول ضمن حدود المخاطر",
    ],
    authorityLimitSAR: 0,
    sector: "finance",
    reportsTo: "sultan",
  },
  {
    id: "noura",
    name: "نورة",
    title: "التسويق",
    rank: "FUNCTIONAL",
    department: "التسويق",
    href: "/departments/marketing",
    responsibilities: ["تحليل السوق والطلب", "الجدوى التسويقية للفرص", "تخطيط الحملات وقياس عائدها"],
    authorityLimitSAR: 0,
    sector: "revenue",
    reportsTo: "sara",
  },
  {
    id: "fahad",
    name: "فهد",
    title: "قائد قطاع العمليات والإمداد",
    rank: "SECTOR_LEAD",
    department: "العمليات",
    href: "/departments/operations",
    responsibilities: ["الجدوى التشغيلية", "تحويل القرار المعتمد إلى مشروع ومهام", "متابعة الإنجاز والجودة"],
    authorityLimitSAR: 0,
    sector: "operations",
    reportsTo: "sultan",
  },
  {
    id: "sara",
    name: "سارة",
    title: "قائدة قطاع الإيرادات",
    rank: "SECTOR_LEAD",
    department: "المبيعات",
    href: "/departments/sales",
    responsibilities: ["إدارة مسار البيع والعملاء", "تغذية الجدوى ببيانات الطلب الفعلي"],
    authorityLimitSAR: 0,
    sector: "revenue",
    reportsTo: "sultan",
  },
  {
    id: "khalid",
    name: "خالد",
    title: "المشتريات والموردون",
    rank: "FUNCTIONAL",
    department: "المشتريات",
    href: "/departments/procurement",
    responsibilities: ["الموردون وأوامر الشراء", "المخزون ونقاط إعادة الطلب", "تكلفة التوريد في الجدوى"],
    authorityLimitSAR: 0,
    sector: "operations",
    reportsTo: "fahad",
  },
  {
    id: "majed",
    name: "ماجد",
    title: "قائد قطاع الامتثال والعلاقات الحكومية",
    rank: "SECTOR_LEAD",
    department: "العلاقات الحكومية",
    href: "/departments/government-relations",
    responsibilities: ["التراخيص والأنظمة", "فحص الامتثال لكل فرصة قبل الاعتماد"],
    authorityLimitSAR: 0,
    sector: "compliance",
    reportsTo: "sultan",
  },
  {
    id: "rased",
    name: "راصد",
    title: "الاستراتيجية والفرص",
    rank: "FUNCTIONAL",
    department: "الإدارة التنفيذية",
    href: "/bi-center",
    responsibilities: ["خط فرص واحد: فكرة مدروسة واحدة يومياً كحد أقصى", "صفر تكرار في الفرص والأفكار"],
    authorityLimitSAR: 0,
    sector: "executive",
    reportsTo: "sultan",
  },
  {
    id: "ameen",
    name: "أمين",
    title: "المحاسبة",
    rank: "FUNCTIONAL",
    department: "المحاسبة",
    href: "/departments/finance",
    responsibilities: ["تسجيل كل قيد (SAR)", "إسناد التكاليف للمشاريع", "القوائم والتقارير"],
    authorityLimitSAR: 0,
    sector: "finance",
    reportsTo: "abdulrahman",
  },
  {
    id: "hares",
    name: "حارس",
    title: "المخاطر والحوكمة (مستقل)",
    rank: "FUNCTIONAL",
    department: "الحوكمة",
    href: "/inbox",
    responsibilities: ["فحص الحوكمة لكل مذكرة صرف بالتوازي مع المالية", "الإيقاف بسبب مصنّف من قائمة ثابتة", "سجل التدقيق", "مستقل: يتبع رئيس مجلس الإدارة، ولا يلغي إيقافه إلا هو"],
    authorityLimitSAR: 0,
    sector: "governance",
    reportsTo: "owner",
  },
  {
    id: "diwan",
    name: "ريّان",
    title: "مكتب المتابعة والفرز",
    rank: "FUNCTIONAL",
    department: "الإدارة التنفيذية",
    href: "/decisions-followup",
    responsibilities: [
      "استقبال كل أمر وارد وفرزه خلال ساعة: النوع والأولوية والمالك والموعد",
      "ضبط مهلة كل حالة والتصعيد درجة درجة: المالك ثم قائد القطاع ثم سلطان",
      "التحقق من دليل الإغلاق خلال 24 ساعة",
      "تجهيز ملخص رئيس مجلس الإدارة اليومي (7 بطاقات قرار كحد أقصى)",
    ],
    authorityLimitSAR: 0,
    sector: "executive",
    reportsTo: "sultan",
  },
];

export function getAgent(id: string): CompanyAgent | undefined {
  return COMPANY_AGENTS.find((a) => a.id === id);
}

export function getAgentsByRank(rank: AgentRank): CompanyAgent[] {
  return COMPANY_AGENTS.filter((a) => a.rank === rank);
}

/** The sector lead an employee escalates to (the employee itself when it leads). */
export function sectorLeadOf(agentId: string): string | null {
  const agent = getAgent(agentId);
  if (!agent) return null;
  if (agent.rank === "SECTOR_LEAD" || agent.rank === "CEO" || agent.rank === "OWNER") return agent.id;
  if (agent.reportsTo && getAgent(agent.reportsTo)?.rank === "SECTOR_LEAD") return agent.reportsTo;
  return agent.reportsTo === "owner" ? agent.id : "sultan";
}

export function getDirectReports(managerId: string): CompanyAgent[] {
  return COMPANY_AGENTS.filter((a) => a.reportsTo === managerId);
}
