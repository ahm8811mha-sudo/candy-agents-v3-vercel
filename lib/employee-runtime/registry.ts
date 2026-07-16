import type { EmployeeKpiDefinition, EmployeeProfile } from "./types";

const kpi = (
  id: string,
  label: string,
  unit: EmployeeKpiDefinition["unit"],
  direction: EmployeeKpiDefinition["direction"],
  target: number,
  warningThreshold?: number,
  criticalThreshold?: number
): EmployeeKpiDefinition => ({ id, label, unit, direction, target, warningThreshold, criticalThreshold });

export const EMPLOYEE_PROFILES: EmployeeProfile[] = [
  {
    id: "sultan", name: "سلطان", title: "الرئيس التنفيذي", department: "الإدارة التنفيذية",
    reportsTo: "owner", backupEmployeeId: "fahad", authorityLimitSAR: 25_000, maxAutonomousRisk: "MEDIUM",
    capabilities: ["ROUTE_WORK", "APPROVE_T1", "REVIEW_EXCEPTION", "ALLOCATE_RESOURCES", "PAUSE_WORKFLOW", "RESUME_WORKFLOW"],
    sopIds: ["SOP-EXEC-001", "SOP-EXCEPTION-001", "SOP-CONTINUITY-001"],
    kpis: [kpi("company_goal_delivery", "تحقق أهداف الشركة", "PERCENT", "HIGHER_IS_BETTER", 90, 80, 65), kpi("owner_intervention_rate", "نسبة تدخل المالك", "PERCENT", "LOWER_IS_BETTER", 10, 20, 35)],
  },
  {
    id: "abdulrahman", name: "عبدالرحمن", title: "المدير المالي", department: "المالية",
    reportsTo: "sultan", backupEmployeeId: "ameen", authorityLimitSAR: 5_000, maxAutonomousRisk: "MEDIUM",
    capabilities: ["CREATE_BUDGET", "CHECK_CASH_POSITION", "APPROVE_EXPENSE_T0", "REVIEW_MARGIN", "RECONCILE_PAYMENT", "GENERATE_PNL", "ESCALATE_FINANCIAL_EXCEPTION"],
    sopIds: ["SOP-FIN-001", "SOP-FIN-002", "SOP-OTC-001", "SOP-P2P-001"],
    kpis: [kpi("forecast_accuracy", "دقة التوقع المالي", "PERCENT", "HIGHER_IS_BETTER", 90, 80, 65), kpi("budget_variance", "انحراف الميزانية", "PERCENT", "LOWER_IS_BETTER", 5, 10, 15)],
  },
  {
    id: "ameen", name: "أمين", title: "المحاسب العام", department: "المحاسبة",
    reportsTo: "abdulrahman", backupEmployeeId: "abdulrahman", authorityLimitSAR: 0, maxAutonomousRisk: "LOW",
    capabilities: ["CREATE_JOURNAL_ENTRY", "CREATE_SALES_INVOICE", "CREATE_PURCHASE_INVOICE", "POST_COGS", "RECONCILE_PAYMENT", "CLOSE_ACCOUNTING_PERIOD"],
    sopIds: ["SOP-ACC-001", "SOP-ACC-002", "SOP-OTC-001", "SOP-P2P-001"],
    kpis: [kpi("balanced_entry_rate", "نسبة القيود المتوازنة", "PERCENT", "HIGHER_IS_BETTER", 100, 99, 97), kpi("duplicate_entry_rate", "القيود المكررة", "PERCENT", "LOWER_IS_BETTER", 0, 0.5, 1)],
  },
  {
    id: "noura", name: "نورة", title: "مديرة التسويق", department: "التسويق",
    reportsTo: "sultan", backupEmployeeId: "sara", authorityLimitSAR: 5_000, maxAutonomousRisk: "MEDIUM",
    capabilities: ["CREATE_CAMPAIGN_PLAN", "CREATE_MARKETING_ASSET", "SEGMENT_CUSTOMER", "MEASURE_ROAS", "OPTIMIZE_CAMPAIGN", "PAUSE_CAMPAIGN"],
    sopIds: ["SOP-MKT-001", "SOP-MKT-002", "SOP-OTC-001"],
    kpis: [kpi("roas", "العائد على الإنفاق الإعلاني", "RATIO", "HIGHER_IS_BETTER", 4, 2.5, 1.5), kpi("cac", "تكلفة اكتساب العميل", "SAR", "LOWER_IS_BETTER", 40, 60, 90)],
  },
  {
    id: "fahad", name: "فهد", title: "مدير العمليات", department: "العمليات",
    reportsTo: "sultan", backupEmployeeId: "khalid", authorityLimitSAR: 5_000, maxAutonomousRisk: "MEDIUM",
    capabilities: ["CREATE_PROJECT", "CREATE_TASK", "ASSIGN_TASK", "CREATE_FULFILLMENT_ORDER", "RECORD_GOODS_RECEIPT", "VERIFY_DELIVERY", "MANAGE_BLOCKER", "RUN_QUALITY_CHECK"],
    sopIds: ["SOP-OPS-001", "SOP-OPS-002", "SOP-OTC-001", "SOP-P2P-001", "SOP-IDEA-001"],
    kpis: [kpi("on_time_delivery", "التسليم في الموعد", "PERCENT", "HIGHER_IS_BETTER", 95, 85, 75), kpi("first_time_success", "النجاح من أول محاولة", "PERCENT", "HIGHER_IS_BETTER", 95, 85, 70)],
  },
  {
    id: "sara", name: "سارة", title: "مديرة المبيعات وعلاقات العملاء", department: "المبيعات",
    reportsTo: "sultan", backupEmployeeId: "noura", authorityLimitSAR: 5_000, maxAutonomousRisk: "MEDIUM",
    capabilities: ["VERIFY_ORDER", "RECORD_SALE", "UPDATE_CRM", "CREATE_SALES_OUTREACH", "PROCESS_RETURN", "ESCALATE_CUSTOMER_EXCEPTION"],
    sopIds: ["SOP-SALES-001", "SOP-CRM-001", "SOP-OTC-001"],
    kpis: [kpi("conversion_rate", "معدل التحويل", "PERCENT", "HIGHER_IS_BETTER", 8, 5, 3), kpi("order_error_rate", "أخطاء الطلبات", "PERCENT", "LOWER_IS_BETTER", 1, 3, 5)],
  },
  {
    id: "khalid", name: "خالد", title: "مدير المشتريات وسلاسل الإمداد", department: "المشتريات",
    reportsTo: "sultan", backupEmployeeId: "fahad", authorityLimitSAR: 5_000, maxAutonomousRisk: "MEDIUM",
    capabilities: ["RESERVE_INVENTORY", "DECREMENT_INVENTORY", "CREATE_PURCHASE_REQUEST", "COMPARE_SUPPLIERS", "CREATE_PURCHASE_ORDER", "REORDER_STOCK"],
    sopIds: ["SOP-PROC-001", "SOP-INV-001", "SOP-OTC-001", "SOP-P2P-001"],
    kpis: [kpi("stockout_rate", "نفاد المخزون", "PERCENT", "LOWER_IS_BETTER", 1, 3, 5), kpi("inventory_accuracy", "دقة المخزون", "PERCENT", "HIGHER_IS_BETTER", 99, 97, 94)],
  },
  {
    id: "majed", name: "ماجد", title: "مدير العلاقات الحكومية والامتثال", department: "العلاقات الحكومية",
    reportsTo: "sultan", backupEmployeeId: "hares", authorityLimitSAR: 5_000, maxAutonomousRisk: "LOW",
    capabilities: ["CHECK_COMPLIANCE", "TRACK_LICENSE", "CREATE_RENEWAL_TASK", "ESCALATE_REGULATORY_RISK"],
    sopIds: ["SOP-COMP-001", "SOP-COMP-002"],
    kpis: [kpi("compliance_breach_count", "مخالفات الامتثال", "COUNT", "LOWER_IS_BETTER", 0, 1, 2), kpi("license_on_time_rate", "التجديد في الموعد", "PERCENT", "HIGHER_IS_BETTER", 100, 95, 90)],
  },
  {
    id: "rased", name: "راصد", title: "محلل الفرص", department: "الاستخبارات",
    reportsTo: "sultan", backupEmployeeId: "noura", authorityLimitSAR: 0, maxAutonomousRisk: "LOW",
    capabilities: ["SCAN_MARKET", "CREATE_OPPORTUNITY", "SCORE_OPPORTUNITY", "ROUTE_OPPORTUNITY"],
    sopIds: ["SOP-EXEC-001", "SOP-GOV-001"],
    kpis: [kpi("qualified_opportunity_rate", "الفرص المؤهلة", "PERCENT", "HIGHER_IS_BETTER", 30, 20, 10), kpi("false_positive_rate", "الفرص غير المجدية", "PERCENT", "LOWER_IS_BETTER", 15, 25, 40)],
  },
  {
    id: "hares", name: "حارس", title: "مسؤول المخاطر والحوكمة", department: "الحوكمة",
    reportsTo: "sultan", backupEmployeeId: "majed", authorityLimitSAR: 0, maxAutonomousRisk: "LOW",
    capabilities: ["CHECK_POLICY", "CHECK_AUTHORITY", "VERIFY_EVIDENCE", "BLOCK_UNAUTHORIZED_ACTION", "CREATE_AUDIT_EVENT", "ESCALATE_RISK"],
    sopIds: ["SOP-GOV-001", "SOP-GOV-002", "SOP-CONTINUITY-001", "SOP-IDEA-001"],
    kpis: [kpi("unauthorized_action_count", "إجراءات غير مصرح بها", "COUNT", "LOWER_IS_BETTER", 0, 1, 1), kpi("evidence_completion_rate", "اكتمال أدلة التنفيذ", "PERCENT", "HIGHER_IS_BETTER", 100, 98, 95)],
  },
];

const profileById = new Map(EMPLOYEE_PROFILES.map((profile) => [profile.id, profile]));

export function getEmployeeProfile(id: string): EmployeeProfile | undefined {
  return profileById.get(id);
}

export function requireEmployeeProfile(id: string): EmployeeProfile {
  const profile = getEmployeeProfile(id);
  if (!profile) throw new Error(`Unknown employee: ${id}`);
  return profile;
}

export function employeeHasCapability(employeeId: string, capability: string): boolean {
  return Boolean(getEmployeeProfile(employeeId)?.capabilities.includes(capability));
}

export function resolveActiveEmployee(employeeId: string, unavailableEmployeeIds: string[] = []): EmployeeProfile {
  const profile = requireEmployeeProfile(employeeId);
  if (!unavailableEmployeeIds.includes(employeeId)) return profile;
  if (!profile.backupEmployeeId) throw new Error(`No backup employee configured for ${employeeId}.`);
  const backup = requireEmployeeProfile(profile.backupEmployeeId);
  if (unavailableEmployeeIds.includes(backup.id)) {
    throw new Error(`Employee ${employeeId} and backup ${backup.id} are both unavailable.`);
  }
  return backup;
}

/**
 * A backup does not permanently inherit another employee's powers. The runtime
 * may grant one capability for one work-order step only when the configured
 * backup relationship is valid. The delegation is recorded on the step and
 * execution receipt.
 */
export function canExecuteCapability(input: {
  activeEmployeeId: string;
  capability: string;
  delegatedFromEmployeeId?: string | null;
}): boolean {
  if (!input.delegatedFromEmployeeId) {
    return employeeHasCapability(input.activeEmployeeId, input.capability);
  }
  const principal = getEmployeeProfile(input.delegatedFromEmployeeId);
  if (!principal || principal.backupEmployeeId !== input.activeEmployeeId) return false;
  return principal.capabilities.includes(input.capability);
}
