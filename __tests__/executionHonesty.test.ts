import { describe, expect, it } from "vitest";
import {
  classifyExecutionKind,
  isOwnerConfirmed,
  isRealWorldTask,
  summarizeExecutionHonesty,
  taskExecutionState,
} from "@/lib/company/executionHonesty";

describe("classifyExecutionKind", () => {
  it("marks funding-bearing steps as REAL_WORLD regardless of wording", () => {
    expect(classifyExecutionKind({ title: "تحليل السوق", requiresFunding: true })).toBe("REAL_WORLD");
    expect(classifyExecutionKind({ title: "تحليل السوق", estimatedCostSAR: 500 })).toBe("REAL_WORLD");
  });

  it("detects real-world Arabic keywords (commercial registration, bank, fees)", () => {
    expect(classifyExecutionKind({ title: "إصدار السجل التجاري" })).toBe("REAL_WORLD");
    expect(classifyExecutionKind({ title: "فتح حساب بنكي للشركة" })).toBe("REAL_WORLD");
    expect(classifyExecutionKind({ title: "متابعة", description: "سداد رسوم الترخيص" })).toBe("REAL_WORLD");
    expect(classifyExecutionKind({ title: "توقيع عقد التوريد" })).toBe("REAL_WORLD");
  });

  it("keeps analysis and documents INTERNAL", () => {
    expect(classifyExecutionKind({ title: "تحليل المنافسين" })).toBe("INTERNAL");
    expect(classifyExecutionKind({ title: "إعداد مذكرة القرار", description: "ملخص تنفيذي" })).toBe("INTERNAL");
  });
});

describe("taskExecutionState", () => {
  it("a real-world task is only REAL_DONE with owner confirmation", () => {
    const base = { metadata: { executionKind: "REAL_WORLD" } };
    expect(taskExecutionState({ ...base, status: "DONE" })).toBe("PLAN_READY");
    expect(taskExecutionState({ status: "DONE", metadata: { executionKind: "REAL_WORLD", ownerConfirmed: true } })).toBe("REAL_DONE");
    expect(taskExecutionState({ status: "DONE", metadata: { executionKind: "REAL_WORLD", ownerConfirmed: "true" } })).toBe("REAL_DONE");
  });

  it("REVIEW on a real-world task reads as plan-ready, not done", () => {
    expect(taskExecutionState({ status: "REVIEW", metadata: { executionKind: "REAL_WORLD", readyForOwner: true } })).toBe("PLAN_READY");
  });

  it("funding and hold states win over kind", () => {
    expect(taskExecutionState({ status: "WAITING_FUNDING", metadata: { executionKind: "REAL_WORLD" } })).toBe("WAITING_FUNDING");
    expect(taskExecutionState({ status: "ON_HOLD", metadata: { executionKind: "REAL_WORLD" } })).toBe("ON_HOLD");
  });

  it("internal tasks close normally", () => {
    expect(taskExecutionState({ status: "DONE", metadata: {} })).toBe("INTERNAL_DONE");
    expect(taskExecutionState({ status: "TODO", metadata: null })).toBe("IN_PROGRESS");
  });
});

describe("summarizeExecutionHonesty", () => {
  it("honest progress only counts confirmed real work", () => {
    const summary = summarizeExecutionHonesty([
      { status: "DONE", metadata: {} },
      { status: "DONE", metadata: { executionKind: "REAL_WORLD" } },
      { status: "REVIEW", metadata: { executionKind: "REAL_WORLD", readyForOwner: true } },
      { status: "DONE", metadata: { executionKind: "REAL_WORLD", ownerConfirmed: true } },
    ]);
    expect(summary.totalTasks).toBe(4);
    expect(summary.internalDone).toBe(1);
    expect(summary.realWorldTotal).toBe(3);
    expect(summary.realWorldConfirmed).toBe(1);
    expect(summary.planReady).toBe(2);
    expect(summary.honestProgress).toBe(50);
  });

  it("empty task list yields zero progress", () => {
    expect(summarizeExecutionHonesty([]).honestProgress).toBe(0);
  });
});

describe("guards", () => {
  it("isRealWorldTask and isOwnerConfirmed read metadata safely", () => {
    expect(isRealWorldTask({ status: "TODO", metadata: null })).toBe(false);
    expect(isOwnerConfirmed({ status: "TODO", metadata: undefined })).toBe(false);
  });
});
