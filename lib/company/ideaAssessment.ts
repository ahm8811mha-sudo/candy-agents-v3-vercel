import { z } from "zod";

/** All forecasts are supplied assumptions. Evidence coverage is not a probability of success. */
export const ideaStudySchema = z.object({
  kind: z.enum(["COMMERCIAL", "OPERATIONAL"]).optional(),
  expectedOutcome: z.string().trim().max(1000).optional(),
  expectedUnits: z.number().finite().nonnegative().max(1e9).optional(),
  unitPriceSAR: z.number().finite().nonnegative().max(1e9).optional(),
  unitCostSAR: z.number().finite().nonnegative().max(1e9).optional(),
  fixedCostSAR: z.number().finite().nonnegative().max(1e9).optional(),
  demandEvidence: z.string().trim().max(3000).optional(),
  evidenceSource: z.string().trim().max(1000).optional(),
  executionOwner: z.string().trim().max(160).optional(),
  successMetric: z.string().trim().max(500).optional(),
  risks: z.string().trim().max(2000).optional(),
});

export type IdeaStudyInput = z.infer<typeof ideaStudySchema>;
export type AssessmentVerdict = "APPROVE" | "CONDITIONAL" | "REJECT";
export type IdeaAssessment = {
  version: 2;
  basis: "OWNER_ASSUMPTIONS" | "OPERATING_RECORDS";
  assessedAt: string;
  input: IdeaStudyInput;
  coverage: number;
  missing: string[];
  readyForDecision: boolean;
  verdict: AssessmentVerdict;
  projections: null | {
    revenueSAR: number;
    variableCostSAR: number;
    totalCostSAR: number;
    profitSAR: number;
    contributionSAR: number;
    breakEvenUnits: number | null;
    returnOnBudgetPercent: number | null;
    downsideProfitSAR: number;
  };
};

export function assessIdea(
  budgetSAR: number,
  input: IdeaStudyInput = {},
  basis: IdeaAssessment["basis"] = "OWNER_ASSUMPTIONS",
  now = new Date(),
): IdeaAssessment {
  const missing: string[] = [];
  const numbers = [input.expectedUnits, input.unitPriceSAR, input.unitCostSAR, input.fixedCostSAR];
  const hasNumbers = numbers.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const operational = input.kind === "OPERATIONAL";
  if (operational && !input.expectedOutcome?.trim()) missing.push("الأثر التشغيلي المتوقع وكيفية اختباره");
  if (!operational && !hasNumbers) missing.push("حجم المبيعات المتوقع وسعر الوحدة وتكلفتها والتكاليف الثابتة");
  if (!input.demandEvidence?.trim()) missing.push("دليل على الطلب أو الحاجة التشغيلية");
  if (!input.evidenceSource?.trim()) missing.push("مرجع البيانات أو وصف مصدرها");
  if (!input.executionOwner?.trim()) missing.push("مسؤول التنفيذ");
  if (!input.successMetric?.trim()) missing.push("مؤشر نجاح قابل للقياس");
  if (!input.risks?.trim()) missing.push("المخاطر وحدود التجربة");

  let projections: IdeaAssessment["projections"] = null;
  if (!operational && hasNumbers && Number.isFinite(budgetSAR) && budgetSAR >= 0) {
    const units = input.expectedUnits!;
    const price = input.unitPriceSAR!;
    const cost = input.unitCostSAR!;
    const fixed = input.fixedCostSAR!;
    const contribution = price - cost;
    const profit = units * contribution - fixed;
    projections = {
      revenueSAR: units * price,
      variableCostSAR: units * cost,
      totalCostSAR: units * cost + fixed,
      profitSAR: profit,
      contributionSAR: contribution,
      breakEvenUnits: contribution > 0 ? Math.ceil(fixed / contribution) : null,
      returnOnBudgetPercent: budgetSAR > 0 ? Math.round((profit / budgetSAR) * 1000) / 10 : null,
      downsideProfitSAR: Math.floor(units * 0.7) * contribution - fixed,
    };
  }
  const readyForDecision = missing.length === 0;
  const verdict: AssessmentVerdict = projections && (projections.contributionSAR <= 0 || projections.profitSAR < 0)
    ? "REJECT"
    : readyForDecision && projections && projections.totalCostSAR <= budgetSAR && projections.downsideProfitSAR >= 0
      ? "APPROVE"
      : "CONDITIONAL";
  return {
    version: 2,
    basis,
    assessedAt: now.toISOString(),
    input,
    coverage: Math.round(((6 - missing.length) / 6) * 100),
    missing,
    readyForDecision,
    verdict,
    projections,
  };
}

export type OperatingSignal = {
  key: string;
  title: string;
  hypothesis: string;
  budgetSAR: number;
  horizonDays: number;
  evidence: string;
  source: string;
  priority: number;
};

/** Candidates depend on actual rows, not a calendar-indexed bank of business ideas. */
export function opportunitiesFromRecords(input: {
  inventory: Array<{ id: string; name: string; on_hand: number; reorder_point: number; unit_cost: number }>;
  blockedTasks: Array<{ id: string; title: string }>;
}): OperatingSignal[] {
  const signals: OperatingSignal[] = [];
  for (const item of input.inventory) {
    if (![item.on_hand, item.reorder_point, item.unit_cost].every(Number.isFinite)) continue;
    const shortage = Math.max(0, item.reorder_point - item.on_hand);
    if (shortage <= 0 || item.unit_cost <= 0) continue;
    signals.push({
      key: `inventory:${item.id}`,
      title: `معالجة نقص مخزون ${item.name}`,
      hypothesis: `الكمية المسجلة ${item.on_hand} أقل من نقطة إعادة الطلب ${item.reorder_point}. تُراجع الحاجة وعرض المورد قبل أي شراء.`,
      budgetSAR: Math.max(1, Math.ceil(shortage * item.unit_cost)),
      horizonDays: 14,
      evidence: `عجز ${shortage} وحدة وفق السجل؛ تكلفة الوحدة المسجلة ${item.unit_cost} ر.س. يلزم تأكيد حداثة المخزون وسعر المورد.`,
      source: `inventory_items/${item.id}`,
      priority: item.on_hand <= 0 ? 100 : 80,
    });
  }
  if (input.blockedTasks.length) {
    signals.push({
      key: `blocker:${input.blockedTasks[0].id}`,
      title: `إزالة عائق: ${input.blockedTasks[0].title}`,
      hypothesis: `توجد ${input.blockedTasks.length} مهام متعثرة في العينة التشغيلية. يبدأ التحسين بتحديد سبب هذه المهمة وتكلفة معالجته.`,
      budgetSAR: 0,
      horizonDays: 7,
      evidence: "المهمة مسجلة بحالة BLOCKED؛ لم تُقدّر تكلفة الحل بعد.",
      source: `tasks/${input.blockedTasks[0].id}`,
      priority: 60,
    });
  }
  return signals.sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
}
