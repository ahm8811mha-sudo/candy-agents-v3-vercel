/**
 * Owner-only spend authority.
 *
 * No employee may approve or execute a monetary commitment above 0 SAR.
 * A spend request reaches the Chairman only after this chain:
 * preparing department → Abdulrahman (finance) and Hares (governance) in
 * parallel → Sultan (recommendation) → Ahmad (Chairman) approves or rejects.
 * A stop (finance "غير موافق", governance "موقوف", Sultan "رفض") returns the
 * item to its department with a classified reason and seven days to fix it;
 * after that it is archived. Only the Chairman can override a stop.
 *
 * Existing pending money items that have no chain are not deleted and not
 * approved. They are read as waiting on Abdulrahman's finance review and
 * flagged needsChainReview until that review is recorded.
 */

export const SPEND_ACTORS = {
  finance: "abdulrahman",
  governance: "hares",
  sultan: "sultan",
  owner: "owner",
} as const;

export const EMPLOYEE_AGENT_IDS = [
  "sultan",
  "abdulrahman",
  "noura",
  "fahad",
  "sara",
  "khalid",
  "majed",
  "rased",
  "ameen",
  "hares",
  "diwan",
] as const;

export type SpendStage = "department" | "finance" | "governance" | "sultan" | "owner" | "decided";

export type FinanceResult = "موافق" | "مشروط" | "غير موافق";
export type GovernanceResult = "سليم" | "مشروط" | "موقوف";
export type SultanResult = "موافقة" | "رفض" | "تعديل";

export type SpendReview = {
  result: string;
  note: string;
  by: string;
  at: string;
  reasonCode?: StopReasonCode;
};

export type SpendChainState = {
  stage: SpendStage;
  preparingAgentId: string;
  subject: string;
  amountSAR: number;
  options: string;
  expectedReturn: string;
  risks: string;
  financeReview: SpendReview | null;
  governanceReview: SpendReview | null;
  sultanRecommendation: SpendReview | null;
  needsChainReview: boolean;
  legacy: boolean;
  note: string;
  decision: "APPROVED" | "REJECTED" | null;
  decidedAt: string | null;
  /** When the request entered its current stage (set on every stage change). */
  stageEnteredAt?: string | null;
  /** Last automatic escalation of a request idle past its SLA. */
  escalation?: { at: string; count: number; holder: string } | null;
  /** Sultan's scored options for the Chairman: each with its share of confidence that it is the best choice. */
  optionSet?: SpendOption[] | null;
  /** Opinions from other concerned departments (marketing, compliance, ...), alongside the four fixed reviews. */
  consultations?: SpendReview[] | null;
};

export type SpendOption = { key: string; label: string; amountSAR: number; score: number; recommended: boolean; rationale: string };

export type DecisionMemo = {
  id: string;
  subject: string;
  amountSAR: number;
  options: string;
  expectedReturn: string;
  risks: string;
  financeReview: string;
  governanceReview: string;
  sultanRecommendation: string;
  decisionRequested: string;
};

export type SpendAdvance =
  | { action: "submit_department"; subject: string; options: string; expectedReturn: string; risks: string; amountSAR?: number }
  | { action: "finance_review"; result: FinanceResult; note: string; reasonCode?: StopReasonCode }
  | { action: "governance_review"; result: GovernanceResult; note: string; reasonCode?: StopReasonCode }
  | { action: "sultan_recommendation"; result: SultanResult; note: string; reasonCode?: StopReasonCode }
  | { action: "resubmit_department"; subject: string; options: string; expectedReturn: string; risks: string; amountSAR?: number }
  | { action: "return_to_department"; note: string }
  | { action: "owner_decision"; decision: "APPROVED" | "REJECTED"; note?: string }
  | { action: "set_options"; options: Array<{ key: string; label: string; amountSAR: number; score: number; rationale?: string }> }
  | { action: "consult"; result: string; note: string };

type ApprovalLike = {
  id?: string;
  title?: string;
  type?: string;
  amount?: number | null;
  status?: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
};

/** Fixed list of stop reasons (G12): every stop carries one of these. */
export const STOP_REASONS = {
  duplicate: "مكرر لطلب سابق",
  missing_numbers: "أرقام ناقصة أو غير مسندة",
  no_budget: "لا سيولة أو بند ميزانية",
  authority: "تجاوز صلاحية أو سياسة",
  legal: "عائق نظامي أو حكومي",
  risk: "مخاطرة أعلى من الحد",
  other: "سبب آخر مذكور في الملاحظة",
} as const;
export type StopReasonCode = keyof typeof STOP_REASONS;

export function stopReasonCode(value: unknown): StopReasonCode {
  return typeof value === "string" && value in STOP_REASONS ? value as StopReasonCode : "other";
}

/** Days a returned item waits for its department before it is archived. */
export const RETURNED_DAYS = 7;

export type ArchiveMark = { reason: string; mergedInto?: string | null; at: string; by: string; note?: string };

export function archivedMark(item: ApprovalLike): ArchiveMark | null {
  const mark = item.metadata?.archived;
  if (!mark || typeof mark !== "object") return null;
  const row = mark as Record<string, unknown>;
  return { reason: String(row.reason || "archived"), mergedInto: row.mergedInto ? String(row.mergedInto) : null, at: String(row.at || ""), by: String(row.by || ""), note: row.note ? String(row.note) : undefined };
}

export function isArchived(item: ApprovalLike): boolean {
  return archivedMark(item) !== null;
}

const CHAIRMAN_ROLES = new Set(["OWNER", "ADMIN"]);

export function isMonetarySpend(amount: unknown): boolean {
  const value = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(value) && value > 0;
}

/** Employees never approve spend. Only the Chairman (owner) may. */
export function agentMayApproveSpend(agentId: string, amountSAR: number): boolean {
  if (!isMonetarySpend(amountSAR)) return false;
  return agentId === "owner";
}

export function isEmployeeAgent(agentId: string): boolean {
  return (EMPLOYEE_AGENT_IDS as readonly string[]).includes(agentId);
}

export function blankSpendChain(input: {
  preparingAgentId?: string;
  subject?: string;
  amountSAR: number;
  legacy?: boolean;
  stage?: SpendStage;
  note?: string;
}): SpendChainState {
  return {
    stage: input.stage || (input.legacy ? "finance" : "department"),
    preparingAgentId: input.preparingAgentId || "department",
    subject: input.subject || "",
    amountSAR: input.amountSAR,
    options: "",
    expectedReturn: "",
    risks: "",
    financeReview: null,
    governanceReview: null,
    sultanRecommendation: null,
    needsChainReview: Boolean(input.legacy),
    legacy: Boolean(input.legacy),
    note: input.note || (input.legacy ? "طلب قائم بلا سلسلة. بانتظار مراجعة عبدالرحمن المالية." : ""),
    decision: null,
    decidedAt: null,
  };
}

function asReview(value: unknown): SpendReview | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const result = String(row.result || "").trim();
  const note = String(row.note || "").trim();
  if (!result || !note) return null;
  return {
    result,
    note,
    by: String(row.by || ""),
    at: String(row.at || ""),
    ...(row.reasonCode ? { reasonCode: stopReasonCode(row.reasonCode) } : {}),
  };
}

export function parseSpendChain(value: unknown, amountSAR: number, title = ""): SpendChainState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const stage = String(row.stage || "");
  if (!["department", "finance", "governance", "sultan", "owner", "decided"].includes(stage)) return null;
  return {
    stage: stage as SpendStage,
    preparingAgentId: String(row.preparingAgentId || "department"),
    subject: String(row.subject || title),
    amountSAR: isMonetarySpend(row.amountSAR) ? Number(row.amountSAR) : amountSAR,
    options: String(row.options || ""),
    expectedReturn: String(row.expectedReturn || ""),
    risks: String(row.risks || ""),
    financeReview: asReview(row.financeReview),
    governanceReview: asReview(row.governanceReview),
    sultanRecommendation: asReview(row.sultanRecommendation),
    needsChainReview: row.needsChainReview === true,
    legacy: row.legacy === true,
    note: String(row.note || ""),
    decision: row.decision === "APPROVED" || row.decision === "REJECTED" ? row.decision : null,
    decidedAt: row.decidedAt ? String(row.decidedAt) : null,
    stageEnteredAt: row.stageEnteredAt ? String(row.stageEnteredAt) : null,
    escalation: parseEscalation(row.escalation),
    optionSet: parseOptions(row.optionSet),
    consultations: Array.isArray(row.consultations) ? row.consultations.map(asReview).filter((r): r is SpendReview => Boolean(r)) : null,
  };
}

export function parseOptions(value: unknown): SpendOption[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const rows = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const key = String(row.key || "").trim(); const label = String(row.label || "").trim();
    const score = Number(row.score); const amountSAR = Number(row.amountSAR);
    if (!key || !label || !Number.isFinite(score) || !Number.isFinite(amountSAR)) return [];
    return [{ key, label, amountSAR: Math.max(0, amountSAR), score: Math.max(0, Math.min(100, Math.round(score))), recommended: row.recommended === true, rationale: String(row.rationale || "") }];
  });
  return rows.length ? rows : null;
}

/** Validate a scored option set: 2 to 5 options, unique keys, scores 0-100 summing to 100, the top score is the recommendation. */
export function buildOptionSet(input: Array<{ key: string; label: string; amountSAR: number; score: number; rationale?: string }>, maxAmount: number): SpendOption[] {
  if (!Array.isArray(input) || input.length < 2 || input.length > 5) throw new Error("الخيارات من 2 إلى 5.");
  const keys = new Set<string>();
  const rows = input.map((o) => {
    const key = String(o.key || "").trim(); const label = String(o.label || "").trim();
    if (!key || keys.has(key)) throw new Error("لكل خيار مفتاح فريد.");
    keys.add(key);
    if (label.length < 3) throw new Error("كل خيار يحتاج وصفاً.");
    const score = Math.round(Number(o.score)); const amountSAR = Number(o.amountSAR);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("نسبة الخيار بين 0 و100.");
    if (!Number.isFinite(amountSAR) || amountSAR < 0 || amountSAR > maxAmount) throw new Error("مبلغ الخيار بين صفر ومبلغ الطلب.");
    return { key, label, amountSAR, score, recommended: false, rationale: String(o.rationale || "").trim() };
  });
  const total = rows.reduce((sum, r) => sum + r.score, 0);
  if (Math.abs(total - 100) > 1) throw new Error("مجموع نسب الخيارات 100%.");
  const top = Math.max(...rows.map((r) => r.score));
  if (rows.filter((r) => r.score === top).length > 1) throw new Error("يلزم خيار أفضل واحد بنسبة أعلى من البقية.");
  return rows.map((r) => ({ ...r, recommended: r.score === top }));
}

function parseEscalation(value: unknown): SpendChainState["escalation"] {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.at) return null;
  return { at: String(row.at), count: Math.max(1, Number(row.count) || 1), holder: String(row.holder || "") };
}

/**
 * Read the chain stored on an approval. A pending money item with no chain
 * is treated as legacy finance review. The row itself is not mutated here.
 */
export function readSpendChain(item: ApprovalLike): SpendChainState | null {
  if (!isMonetarySpend(item.amount)) return null;
  const amount = Number(item.amount);
  const stored = parseSpendChain(item.metadata?.spendChain, amount, item.title);
  if (stored) return stored;
  if (item.status && item.status !== "PENDING" && item.status !== "DEFERRED") return null;
  return blankSpendChain({
    amountSAR: amount,
    subject: item.title || "طلب صرف قائم",
    legacy: true,
    stage: "finance",
    note: "needs chain review",
  });
}

export function isOwnerReadySpend(state: SpendChainState | null): boolean {
  if (!state || state.decision) return false;
  if (state.needsChainReview) return false;
  if (state.governanceReview?.result === "موقوف") return false;
  // A stopped request is never "awaiting the Chairman's decision" (G6).
  if (spendStop(state)) return false;
  return state.stage === "owner"
    && Boolean(state.financeReview)
    && Boolean(state.governanceReview)
    && Boolean(state.sultanRecommendation);
}

export type SpendStop = { by: "finance" | "governance" | "sultan"; result: string; note: string; at: string; label: string; reasonCode: StopReasonCode; reason: string };

/**
 * A negative review (finance "غير موافق", governance "موقوف", Sultan "رفض") ends the reviewers' work.
 * The item leaves their queue and goes to the Chairman, who alone closes it. It is never auto-rejected.
 */
export function spendStop(state: SpendChainState | null): SpendStop | null {
  if (!state || state.decision || state.stage === "decided") return null;
  const wait = " — بانتظار إقفال رئيس مجلس الإدارة";
  if (state.governanceReview?.result === "موقوف") return { by: "governance", ...pick(state.governanceReview), label: "موقوف من الحوكمة" + wait };
  if (state.financeReview?.result === "غير موافق") return { by: "finance", ...pick(state.financeReview), label: "غير موافق من المالية" + wait };
  if (state.sultanRecommendation?.result === "رفض") return { by: "sultan", ...pick(state.sultanRecommendation), label: "رفض من الرئيس التنفيذي" + wait };
  return null;
}
function pick(r: SpendReview) { const reasonCode = r.reasonCode || "other"; return { result: r.result, note: r.note, at: r.at, reasonCode, reason: STOP_REASONS[reasonCode] }; }

/** Items the Chairman can act on: a complete memo, or a stop that is waiting for him to close it. */
export function isChairmanActionable(state: SpendChainState | null): boolean {
  return isOwnerReadySpend(state) || Boolean(spendStop(state));
}

export function spendReviewHistory(state: SpendChainState | null) {
  if (!state) return [];
  const row = (stage: string, r: SpendReview | null) => r ? [{ stage, result: r.result, note: r.note, by: r.by, at: r.at }] : [];
  return [...row("finance", state.financeReview), ...row("governance", state.governanceReview), ...row("ceo", state.sultanRecommendation)];
}

/**
 * Pending money reaches the Chairman only after the full chain (department ->
 * Abdulrahman -> Hares -> Sultan) completed without a stop. A stopped item goes
 * back to its department (see returnedToDepartment); the Chairman can still
 * close it from the action endpoints, but it is not "awaiting his decision".
 */
export function approvalVisibleToChairman(item: ApprovalLike): boolean {
  if (!isMonetarySpend(item.amount)) return true;
  if (item.status && item.status !== "PENDING" && item.status !== "DEFERRED") return true;
  return isOwnerReadySpend(readSpendChain(item));
}

/** A pending spend request a reviewer stopped: returned to its department, not on the Chairman's desk. */
export function returnedToDepartment(item: ApprovalLike): SpendStop | null {
  if (!isMonetarySpend(item.amount)) return null;
  if (item.status && item.status !== "PENDING" && item.status !== "DEFERRED") return null;
  if (isArchived(item)) return null;
  const stop = spendStop(readSpendChain(item));
  return stop ? { ...stop, label: stop.label.replace(" — بانتظار إقفال رئيس مجلس الإدارة", " — أُعيد للقسم") } : null;
}

/** Who fixes a returned item: the preparing employee, else the idea pipeline (Rased), else Sultan. */
export function returnHolder(item: ApprovalLike): string {
  const chain = readSpendChain(item);
  const preparing = chain?.preparingAgentId && chain.preparingAgentId !== "department" ? chain.preparingAgentId : "";
  if (preparing && isEmployeeAgent(preparing)) return preparing;
  const meta = typeof item.metadata?.preparingAgentId === "string" ? item.metadata.preparingAgentId : "";
  if (meta && isEmployeeAgent(meta)) return meta;
  if (item.type === "IDEA" || String(item.title || "").startsWith("فكرة") || String(item.title || "").startsWith("Opportunity radar") || String(item.title || "").startsWith("تجربة رادار الفرص")) return "rased";
  return "sultan";
}

/** When a returned item is archived if its department does not fix it. */
/** Items stopped before the return policy went live get their seven days from that moment. */
export const RETURN_POLICY_EFFECTIVE_AT = "2026-11-13T17:00:00.000Z";

export function returnedExpiresAt(stop: SpendStop, item: ApprovalLike): string {
  const stoppedAt = Date.parse(stop.at) || Date.parse(item.createdAt || "") || Date.now();
  const base = Math.max(stoppedAt, Date.parse(RETURN_POLICY_EFFECTIVE_AT));
  return new Date(base + RETURNED_DAYS * 86_400_000).toISOString();
}

export function duplicateKey(item: ApprovalLike) {
  const title = String(item.title || "").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/\s+/g, " ").trim();
  return `${title}|${isMonetarySpend(item.amount) ? Number(item.amount) : ""}`;
}

/** Collapse repeats (same title and amount, e.g. the same daily idea on several days) into the first item. */
export function collapseDuplicates<T extends ApprovalLike>(items: T[]): Array<T & { duplicateCount: number; duplicateIds: string[] }> {
  const groups = new Map<string, T & { duplicateCount: number; duplicateIds: string[] }>();
  for (const item of items.filter((entry) => !isArchived(entry))) {
    const key = duplicateKey(item);
    const group = groups.get(key);
    if (group) {
      group.duplicateCount += 1;
      if (item.id) group.duplicateIds.push(item.id);
    } else {
      groups.set(key, { ...item, duplicateCount: 1, duplicateIds: item.id ? [item.id] : [] });
    }
  }
  return [...groups.values()];
}

/** Finance and governance review in parallel; both are open until each has written its review. */
export function pendingReviewers(state: SpendChainState): string[] {
  if (state.decision || state.stage === "decided" || spendStop(state)) return [];
  if (state.stage !== "finance" && state.stage !== "governance") return [];
  return [
    ...(state.financeReview ? [] : [SPEND_ACTORS.finance]),
    ...(state.governanceReview ? [] : [SPEND_ACTORS.governance]),
  ];
}

export function spendStageAgent(state: SpendChainState): string | null {
  if (state.decision || state.stage === "decided") return null;
  // A stopped request goes back to the department that prepared it, not to the Chairman.
  if (spendStop(state)) return state.preparingAgentId && state.preparingAgentId !== "department" ? state.preparingAgentId : "department";
  if (state.stage === "department") return state.preparingAgentId;
  if (state.stage === "finance" || state.stage === "governance") return pendingReviewers(state)[0] || SPEND_ACTORS.sultan;
  if (state.stage === "sultan") return SPEND_ACTORS.sultan;
  if (state.stage === "owner") return SPEND_ACTORS.owner;
  return null;
}

export function toDecisionMemo(id: string, state: SpendChainState): DecisionMemo {
  return {
    id,
    subject: state.subject || "طلب صرف",
    amountSAR: state.amountSAR,
    options: state.options || "غير مذكور في الطلب",
    expectedReturn: state.expectedReturn || "غير مذكور في الطلب",
    risks: state.risks || "غير مذكور في الطلب",
    financeReview: state.financeReview ? `${state.financeReview.result}: ${state.financeReview.note}` : "لم تكتمل",
    governanceReview: state.governanceReview ? `${state.governanceReview.result}: ${state.governanceReview.note}` : "لم تكتمل",
    sultanRecommendation: state.sultanRecommendation ? `${state.sultanRecommendation.result}: ${state.sultanRecommendation.note}` : "لم تكتمل",
    decisionRequested: "موافقة أو رفض من رئيس مجلس الإدارة",
  };
}

export function formatDecisionMemo(memo: DecisionMemo): string {
  return [
    `الموضوع: ${memo.subject}`,
    `المبلغ: ${memo.amountSAR} ر.س`,
    `الخيارات والبدائل: ${memo.options}`,
    `العائد المتوقع: ${memo.expectedReturn}`,
    `المخاطر: ${memo.risks}`,
    `نتيجة المراجعة المالية: ${memo.financeReview}`,
    `نتيجة الحوكمة: ${memo.governanceReview}`,
    `توصية سلطان: ${memo.sultanRecommendation}`,
    `القرار المطلوب: ${memo.decisionRequested}`,
  ].join("\n");
}

function requireNote(note: string, label: string) {
  const text = note.trim();
  if (text.length < 8) throw new Error(`${label} يحتاج ملاحظة واضحة.`);
  return text;
}

export function advanceSpendChain(state: SpendChainState, actorId: string, advance: SpendAdvance, now = new Date().toISOString()): SpendChainState {
  const next = advanceSpendChainStep(state, actorId, advance, now);
  if (advance.action === "set_options" || advance.action === "consult") return next;
  // Every movement restarts the stage clock and clears the escalation of the old stage.
  return { ...next, stageEnteredAt: now, escalation: next.stage === state.stage && next.decision === state.decision ? state.escalation ?? null : null };
}

function advanceSpendChainStep(state: SpendChainState, actorId: string, advance: SpendAdvance, now: string): SpendChainState {
  if (advance.action === "set_options") {
    if (state.decision || state.stage === "decided") throw new Error("صدر قرار رئيس مجلس الإدارة على هذا الطلب.");
    if (actorId !== SPEND_ACTORS.sultan) throw new Error("خيارات القرار يعدّها سلطان فقط.");
    if (state.stage !== "sultan" && state.stage !== "owner") throw new Error("الخيارات تُعدّ بعد المالية والحوكمة.");
    return { ...state, optionSet: buildOptionSet(advance.options, state.amountSAR) };
  }
  if (advance.action === "consult") {
    if (state.decision || state.stage === "decided") throw new Error("صدر قرار رئيس مجلس الإدارة على هذا الطلب.");
    if (!isEmployeeAgent(actorId)) throw new Error("الرأي من موظف فقط.");
    const review: SpendReview = { result: String(advance.result || "رأي").slice(0, 40), note: requireNote(advance.note, "الرأي"), by: actorId, at: now };
    return { ...state, consultations: [...(state.consultations || []).filter((r) => r.by !== actorId), review] };
  }
  if (actorId !== "owner" && advance.action === "owner_decision") {
    throw new Error("لا يملك أي موظف صلاحية اعتماد الصرف. الاعتماد لرئيس مجلس الإدارة فقط.");
  }
  if (state.decision || state.stage === "decided") {
    throw new Error("صدر قرار رئيس مجلس الإدارة على هذا الطلب.");
  }
  const next: SpendChainState = { ...state, amountSAR: state.amountSAR };

  if (advance.action === "submit_department") {
    if (state.stage !== "department") throw new Error("التجهيز تم. السلسلة لا تعود للخلف.");
    if (actorId === "owner") throw new Error("رئيس مجلس الإدارة لا يجهّز طلب الصرف. يجهّزه القسم.");
    if (state.preparingAgentId !== "department" && actorId !== state.preparingAgentId) {
      throw new Error("تجهيز الطلب من القسم صاحب الطلب فقط.");
    }
    const subject = advance.subject.trim();
    const options = advance.options.trim();
    const expectedReturn = advance.expectedReturn.trim();
    const risks = advance.risks.trim();
    if (subject.length < 3 || options.length < 3 || expectedReturn.length < 3 || risks.length < 3) {
      throw new Error("مذكرة القسم تحتاج الموضوع والبدائل والعائد والمخاطر.");
    }
    const amount = advance.amountSAR ?? state.amountSAR;
    if (!isMonetarySpend(amount)) throw new Error("لا سلسلة صرف بلا مبلغ أكبر من صفر.");
    return { ...next, stage: "finance", subject, options, expectedReturn, risks, amountSAR: amount, preparingAgentId: actorId === "department" ? state.preparingAgentId : actorId };
  }

  if (advance.action === "resubmit_department") {
    // The department fixed a returned request: the old reviews are kept in the note, the chain restarts.
    if (!spendStop(state)) throw new Error("إعادة التقديم لطلب أُعيد للقسم فقط.");
    if (state.preparingAgentId !== "department" && actorId !== state.preparingAgentId) throw new Error("إعادة التقديم من القسم صاحب الطلب فقط.");
    if (actorId === "owner") throw new Error("رئيس مجلس الإدارة لا يجهّز طلب الصرف. يجهّزه القسم.");
    const subject = advance.subject.trim(), options = advance.options.trim(), expectedReturn = advance.expectedReturn.trim(), risks = advance.risks.trim();
    if (subject.length < 3 || options.length < 3 || expectedReturn.length < 3 || risks.length < 3) throw new Error("مذكرة القسم تحتاج الموضوع والبدائل والعائد والمخاطر.");
    const amount = advance.amountSAR ?? state.amountSAR;
    if (!isMonetarySpend(amount)) throw new Error("لا سلسلة صرف بلا مبلغ أكبر من صفر.");
    const stop = spendStop(state)!;
    return { ...next, stage: "finance", subject, options, expectedReturn, risks, amountSAR: amount, financeReview: null, governanceReview: null, sultanRecommendation: null, needsChainReview: false, note: `أُعيد تقديمه بعد إيقاف سابق (${stop.reason}): ${stop.note}`.slice(0, 600) };
  }

  if (advance.action === "return_to_department") {
    // The Chairman returns a memo with a note: it goes back to the department to rework.
    if (actorId !== "owner") throw new Error("الإعادة من مكتب رئيس مجلس الإدارة فقط.");
    const note = requireNote(advance.note, "الإعادة");
    return { ...next, stage: "department", financeReview: null, governanceReview: null, sultanRecommendation: null, note: `أعاده رئيس مجلس الإدارة: ${note}` };
  }

  if (advance.action === "finance_review") {
    if (state.stage !== "finance" && state.stage !== "governance") throw new Error("المراجعة المالية تأتي بعد تجهيز القسم، لا قبله ولا بعده.");
    if (actorId !== SPEND_ACTORS.finance) throw new Error("المراجعة المالية لعبدالرحمن فقط.");
    if (state.financeReview && !state.needsChainReview) throw new Error("سُجّلت المراجعة المالية على هذا الطلب.");
    const review: SpendReview = { result: advance.result, note: requireNote(advance.note, "المراجعة المالية"), by: actorId, at: now, ...(advance.result === "غير موافق" ? { reasonCode: stopReasonCode(advance.reasonCode) } : {}) };
    if (advance.result === "غير موافق") return { ...next, stage: "owner", needsChainReview: false, financeReview: review, note: "غير موافق من المالية، أُعيد للقسم." };
    const governanceDone = Boolean(state.governanceReview) && state.governanceReview?.result !== "موقوف";
    return { ...next, stage: governanceDone ? "sultan" : "governance", needsChainReview: false, financeReview: review };
  }

  if (advance.action === "governance_review") {
    if (state.stage !== "governance" && state.stage !== "finance") throw new Error("فحص الحوكمة يأتي بعد تجهيز القسم.");
    if (state.stage === "finance" && state.needsChainReview) throw new Error("فحص الحوكمة يأتي بعد المراجعة المالية لهذا الطلب القائم.");
    if (actorId !== SPEND_ACTORS.governance) throw new Error("فحص الحوكمة لحارس فقط.");
    if (state.governanceReview) throw new Error("سُجّل فحص الحوكمة على هذا الطلب.");
    const review: SpendReview = { result: advance.result, note: requireNote(advance.note, "فحص الحوكمة"), by: actorId, at: now, ...(advance.result === "موقوف" ? { reasonCode: stopReasonCode(advance.reasonCode) } : {}) };
    if (advance.result === "موقوف") {
      return { ...next, stage: "owner", governanceReview: review, note: "موقوف من الحوكمة، أُعيد للقسم. لا يُرفع لسلطان." };
    }
    return { ...next, stage: state.financeReview ? "sultan" : "finance", governanceReview: review };
  }

  if (advance.action === "sultan_recommendation") {
    if (state.stage !== "sultan") throw new Error("توصية سلطان تأتي بعد فحص حارس.");
    if (actorId !== SPEND_ACTORS.sultan) throw new Error("التوصية النهائية لسلطان فقط، وليست اعتماداً.");
    if (!state.financeReview || !state.governanceReview) throw new Error("لا توصية قبل اكتمال المالية والحوكمة.");
    return {
      ...next,
      stage: "owner",
      sultanRecommendation: { result: advance.result, note: requireNote(advance.note, "توصية سلطان"), by: actorId, at: now, ...(advance.result === "رفض" ? { reasonCode: stopReasonCode(advance.reasonCode) } : {}) },
    };
  }

  const stop = spendStop(state);
  if (stop && actorId === "owner" && advance.action === "owner_decision" && advance.decision === "APPROVED") {
    throw new Error("لا يُعتمد طلب أوقفته سلسلة المراجعة. يمكن لرئيس مجلس الإدارة إقفاله بالرفض أو إعادته للمراجعة.");
  }
  if (!stop && (state.stage !== "owner" || !isOwnerReadySpend(state))) {
    throw new Error("الطلب لم يكتمل في سلسلة المراجعة، ولن يُعرض لرئيس مجلس الإدارة قبل ذلك.");
  }
  if (actorId !== "owner") throw new Error("لا يملك أي موظف صلاحية اعتماد الصرف.");
  return { ...next, stage: "decided", decision: advance.decision, decidedAt: now, note: advance.note?.trim() || next.note };
}

export function chairmanSpendBlock(role: string | null | undefined, item: ApprovalLike): string | null {
  if (!isMonetarySpend(item.amount)) return null;
  if (item.status && item.status !== "PENDING" && item.status !== "DEFERRED") return null;
  if (!role || !CHAIRMAN_ROLES.has(role)) {
    return "لا يملك أي موظف صلاحية اعتماد الصرف. الاعتماد لرئيس مجلس الإدارة فقط.";
  }
  if (!isChairmanActionable(readSpendChain(item))) {
    return "الطلب المالي بانتظار سلسلة المراجعة (القسم، عبدالرحمن، حارس، سلطان) ولن يصل لرئيس مجلس الإدارة قبل اكتمالها.";
  }
  return null;
}

const BLOCKED_ACTOR = new Set<string>([...EMPLOYEE_AGENT_IDS, "ceo", "سلطان", "عبدالرحمن", "حارس"]);

export function employeeActorBlocked(decidedBy: string): boolean {
  const value = decidedBy.trim().toLowerCase();
  if (BLOCKED_ACTOR.has(value) || BLOCKED_ACTOR.has(decidedBy.trim())) return true;
  return decidedBy.trim() === "CEO";
}

/**
 * Who holds a spend request now, always a real employee (never the vague
 * "department"): a returned request sits with its preparing employee; a
 * request still waiting for its department memo and prepared by no named
 * employee sits with the employee who owns that pipeline (Rased for
 * opportunity and idea requests, otherwise Sultan).
 */
export function spendHolder(item: ApprovalLike): string | null {
  const chain = readSpendChain(item);
  if (!chain) return null;
  if (returnedToDepartment(item) || spendStop(chain)) return returnHolder(item);
  if (chain.stage === "department" && (!chain.preparingAgentId || chain.preparingAgentId === "department")) return returnHolder(item);
  return spendStageAgent(chain);
}

/** A stage may hold a request at most this long before it is escalated. */
export const SPEND_STAGE_SLA_HOURS = 48;

/** When the request entered its current stage: the recorded clock, else its last review, else its creation. */
export function spendStageSince(item: ApprovalLike): string {
  const chain = readSpendChain(item);
  const reviews = chain ? [chain.financeReview, chain.governanceReview, chain.sultanRecommendation].filter(Boolean).map((r) => r!.at).filter((at) => Date.parse(at)).sort() : [];
  return chain?.stageEnteredAt || reviews.at(-1) || item.createdAt || new Date(0).toISOString();
}

export type SpendOverdue = { holder: string; since: string; dueAt: string; hours: number; escalations: number };

/**
 * A request idle in a reviewer's stage past the SLA. The Chairman's own stage
 * is not "overdue" (his desk has its own reminders), and a returned request
 * has its own seven-day archive clock.
 */
export function spendOverdue(item: ApprovalLike, now = new Date()): SpendOverdue | null {
  if (!isMonetarySpend(item.amount)) return null;
  if (item.status && item.status !== "PENDING" && item.status !== "DEFERRED") return null;
  if (isArchived(item)) return null;
  const chain = readSpendChain(item);
  if (!chain || chain.decision || chain.stage === "owner" || chain.stage === "decided" || spendStop(chain)) return null;
  const holder = spendHolder(item);
  if (!holder) return null;
  const since = spendStageSince(item);
  const due = Date.parse(since) + SPEND_STAGE_SLA_HOURS * 3_600_000;
  if (!Number.isFinite(due) || now.getTime() < due) return null;
  return { holder, since, dueAt: new Date(due).toISOString(), hours: Math.floor((now.getTime() - Date.parse(since)) / 3_600_000), escalations: chain.escalation?.count || 0 };
}

/** Escalate at most once a day per request, to the holder and Sultan (never to the Chairman). */
export function spendEscalationDue(item: ApprovalLike, now = new Date()): SpendOverdue | null {
  const overdue = spendOverdue(item, now);
  if (!overdue) return null;
  const last = readSpendChain(item)?.escalation;
  if (last && now.getTime() - Date.parse(last.at) < 24 * 3_600_000) return null;
  return overdue;
}

/** The project a decision belongs to, when its record names one. */
export function linkedProjectId(item: ApprovalLike): string | null {
  const meta = item.metadata || {};
  const direct = meta.projectId || meta.project_id || meta.executedProjectId;
  if (typeof direct === "string" && direct) return direct;
  const type = String(meta.entityType || "");
  if ((type === "projects" || type === "project" || type === "COMPANY_EXECUTION_PROJECT") && typeof meta.entityId === "string" && meta.entityId) return meta.entityId;
  return null;
}
