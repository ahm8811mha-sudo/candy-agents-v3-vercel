/**
 * Execution honesty: the difference between "the agent produced a document"
 * and "the thing actually happened in the real world".
 *
 * Every task carries metadata.executionKind:
 *  - INTERNAL:    the deliverable IS the work (analysis, plan, memo, table).
 *    Agents may close these tasks at 100%.
 *  - REAL_WORLD:  closing requires an external fact (a registration, a paid
 *    fee, a signed contract, an opened bank account). Agents can only bring
 *    these to REVIEW at a capped progress; the owner (or an attached receipt)
 *    is the only path to DONE. A database trigger enforces the same rule.
 */

export type ExecutionKind = "INTERNAL" | "REAL_WORLD";

/** Agents may never report a real-world step above this progress. */
export const REAL_WORLD_AGENT_PROGRESS_CAP = 60;

const REAL_WORLD_PATTERNS: RegExp[] = [
  /سجل\s*تجاري|السجل\s*التجاري/,
  /حساب\s*بنكي|فتح\s*حساب|تحويل\s*بنكي/,
  /دفع|سداد|رسوم|تحصيل\s*رسمي/,
  /ترخيص|رخصة|تصريح|توثيق\s*رسمي/,
  /عقد|توقيع|اتفاقية/,
  /شراء|توريد|مخزون|مورد/,
  /حكوم|وزارة|بلدية|زكاة|ضريب|جمارك|منصة\s*اعتماد/,
  /اشتراك\s*مدفوع|بوابة\s*دفع/,
  /commercial\s*regist|bank\s*account|payment|license|permit|contract|procure|purchase|government|supplier/i,
];

export type ClassifiableStep = {
  title: string;
  description?: string;
  requiresFunding?: boolean;
  estimatedCostSAR?: number;
};

export function classifyExecutionKind(step: ClassifiableStep): ExecutionKind {
  if (step.requiresFunding || Number(step.estimatedCostSAR || 0) > 0) return "REAL_WORLD";
  const haystack = `${step.title} ${step.description || ""}`;
  return REAL_WORLD_PATTERNS.some((pattern) => pattern.test(haystack)) ? "REAL_WORLD" : "INTERNAL";
}

export type HonestyTask = {
  status: string;
  progress_percent?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type TaskExecutionState =
  | "REAL_DONE"        // real-world step confirmed executed by the owner
  | "PLAN_READY"       // agent finished the paperwork; the real act is pending
  | "WAITING_FUNDING"  // blocked on the CFO/owner budget sign-off
  | "ON_HOLD"          // funding rejected or paused
  | "INTERNAL_DONE"    // internal deliverable completed
  | "IN_PROGRESS"      // anything still moving
  | "BLOCKED";

export function isRealWorldTask(task: HonestyTask): boolean {
  return String(task.metadata?.executionKind || "INTERNAL") === "REAL_WORLD";
}

export function isOwnerConfirmed(task: HonestyTask): boolean {
  return String(task.metadata?.ownerConfirmed || "") === "true" || task.metadata?.ownerConfirmed === true;
}

export function taskExecutionState(task: HonestyTask): TaskExecutionState {
  const status = String(task.status || "").toUpperCase();
  if (status === "WAITING_FUNDING") return "WAITING_FUNDING";
  if (status === "ON_HOLD") return "ON_HOLD";
  if (status === "BLOCKED") return "BLOCKED";
  if (isRealWorldTask(task)) {
    if (status === "DONE" && isOwnerConfirmed(task)) return "REAL_DONE";
    if (status === "DONE" || status === "REVIEW" || task.metadata?.readyForOwner) return "PLAN_READY";
    return "IN_PROGRESS";
  }
  return status === "DONE" ? "INTERNAL_DONE" : "IN_PROGRESS";
}

export const executionStateLabels: Record<TaskExecutionState, string> = {
  REAL_DONE: "نُفذ فعلياً",
  PLAN_READY: "الخطة جاهزة — لم يُنفذ بعد",
  WAITING_FUNDING: "بانتظار اعتماد التمويل",
  ON_HOLD: "موقوف",
  INTERNAL_DONE: "مكتمل (عمل داخلي)",
  IN_PROGRESS: "قيد العمل",
  BLOCKED: "بانتظار الاعتماد",
};

export type HonestySummary = {
  totalTasks: number;
  internalTotal: number;
  internalDone: number;
  realWorldTotal: number;
  realWorldConfirmed: number;
  planReady: number;
  waitingFunding: number;
  /** Percentage where real-world steps only count once truly executed. */
  honestProgress: number;
};

export function summarizeExecutionHonesty(tasks: HonestyTask[]): HonestySummary {
  const summary: HonestySummary = {
    totalTasks: tasks.length,
    internalTotal: 0,
    internalDone: 0,
    realWorldTotal: 0,
    realWorldConfirmed: 0,
    planReady: 0,
    waitingFunding: 0,
    honestProgress: 0,
  };
  for (const task of tasks) {
    const state = taskExecutionState(task);
    if (isRealWorldTask(task)) {
      summary.realWorldTotal += 1;
      if (state === "REAL_DONE") summary.realWorldConfirmed += 1;
      if (state === "PLAN_READY") summary.planReady += 1;
    } else {
      summary.internalTotal += 1;
      if (state === "INTERNAL_DONE") summary.internalDone += 1;
    }
    if (state === "WAITING_FUNDING") summary.waitingFunding += 1;
  }
  summary.honestProgress = summary.totalTasks
    ? Math.round(((summary.internalDone + summary.realWorldConfirmed) / summary.totalTasks) * 100)
    : 0;
  return summary;
}
