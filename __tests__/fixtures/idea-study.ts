import type { IdeaStudyInput } from "../../lib/company/ideaAssessment";

/** Explicit synthetic assumptions for tests that exercise the approval gate. */
export const completeStudy: IdeaStudyInput = {
  expectedUnits: 100, unitPriceSAR: 30, unitCostSAR: 10, fixedCostSAR: 200,
  demandEvidence: "نتائج اختبار طلب تجريبي ضمن بيانات الاختبار فقط",
  evidenceSource: "test-fixture / no real commercial evidence",
  executionOwner: "مسؤول الاختبار", successMetric: "بيع 100 وحدة خلال مدة الاختبار",
  risks: "إيقاف التجربة إذا تجاوزت التكلفة السقف المعتمد",
};
