import { describe, expect, it } from "vitest";
import { findDuplicateSteps, isOverdueStep, planStepSweep, sameWork, stepAgent, type StepRow } from "./projectSteps";

const step = (id: string, title: string, owner_role: string, extra: Partial<StepRow> = {}): StepRow => ({
  id, project_id: "p5", title, owner_role, status: "BLOCKED", due_date: "2026-08-20", metadata: {}, ...extra,
});

// The 13 steps of project #5 as they stood on 2026-11-24.
const project5: StepRow[] = [
  step("t1", "مراجعة الأداء والتدقيق المالي", "Risk Manager"),
  step("t2", "مقارنة النماذج المالية", "CFO"),
  step("t3", "بناء اقتصاديات الوحدة", "CFO"),
  step("t4", "تأهيل الموردين", "Operations Manager"),
  step("t5", "إعداد حساب أمازون وربط المنتجات (FBM)", "Operations Manager"),
  step("t6", "تعريف العميل وعرض القيمة", "Marketing Director"),
  step("t7", "إعداد حساب أمازون وربط الكتالوج", "Supply Chain Manager"),
  step("t8", "إعداد نموذج التسويق بالعمولة", "Risk Manager"),
  step("t9", "تثبيت بوابة الصرف", "CFO"),
  step("t10", "تشغيل اختبار الطلب", "Marketing Director"),
  step("t11", "تأهيل الموردين وفحص العينات", "Supply Chain Manager"),
  step("t12", "إعداد قائمة المنتجات التجريبية", "Marketing Director"),
  step("t13", "الفحص القانوني والامتثال", "Risk Manager"),
];

describe("project steps", () => {
  it("routes each owning role to an employee", () => {
    expect(stepAgent(project5[1])).toBe("abdulrahman");
    expect(stepAgent(project5[0])).toBe("hares");
    expect(stepAgent(project5[3])).toBe("fahad");
    expect(stepAgent(project5[5])).toBe("noura");
    expect(stepAgent(project5[6])).toBe("khalid");
    expect(stepAgent({ owner_role: "CFO", metadata: { assignedAgent: "sara" } })).toBe("sara");
  });

  it("merges the two duplicate pairs of project #5 and keeps the specific title", () => {
    const pairs = findDuplicateSteps(project5).map((pair) => [pair.keep.id, pair.drop.id]);
    expect(pairs).toEqual(expect.arrayContaining([["t5", "t7"], ["t11", "t4"]]));
    expect(pairs).toHaveLength(2);
  });

  it("does not merge different work", () => {
    expect(sameWork("مقارنة النماذج المالية", "بناء اقتصاديات الوحدة")).toBe(false);
    expect(sameWork("تعريف العميل وعرض القيمة", "تشغيل اختبار الطلب")).toBe(false);
  });

  it("releases every no-spend step and sends only money to the spend chain", () => {
    const withSpend = [...project5, step("t14", "شراء عينات", "Supply Chain Manager", { metadata: { requiresFunding: true, estimatedCostSAR: 800 } })];
    const plan = planStepSweep(withSpend, "2026-11-24");
    expect(plan.release).toHaveLength(11);
    expect(plan.toFunding.map((item) => item.id)).toEqual(["t14"]);
    expect(plan.duplicates).toHaveLength(2);
    // Released steps that are past due are escalated at once.
    expect(plan.overdue.length).toBe(12);
  });

  it("counts BLOCKED steps as overdue, but not real-world steps waiting on the owner", () => {
    expect(isOverdueStep({ status: "BLOCKED", due_date: "2026-08-01", metadata: {} }, "2026-11-24")).toBe(true);
    expect(isOverdueStep({ status: "REVIEW", due_date: "2026-08-01", metadata: { readyForOwner: true } }, "2026-11-24")).toBe(false);
    expect(isOverdueStep({ status: "DONE", due_date: "2026-08-01", metadata: {} }, "2026-11-24")).toBe(false);
  });

  it("leaves a step on manual hold alone", () => {
    const plan = planStepSweep([step("h", "دراسة", "CFO", { metadata: { manualHold: true } })], "2026-11-24");
    expect(plan.release).toHaveLength(0);
  });
});

describe("steps added on purpose", () => {
  it("never merges a keepSeparate step into a similar one", () => {
    const done = step("a", "مراجعة الامتثال والعقود", "Risk", { status: "DONE" });
    const added = step("b", "مراجعة الامتثال والعقود للمورد", "Risk", { status: "TODO", metadata: { keepSeparate: true } });
    expect(findDuplicateSteps([done, added])).toEqual([]);
    expect(findDuplicateSteps([done, { ...added, metadata: {} }]).length).toBe(1);
  });
  it("routes an added step to its assigned employee", () => {
    expect(stepAgent({ owner_role: "Legal & Compliance", metadata: { assignedAgent: "majed" } })).toBe("majed");
    expect(stepAgent({ owner_role: "Executive Office", metadata: { assignedAgent: "diwan" } })).toBe("diwan");
  });
});
