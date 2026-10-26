/**
 * Owner-only spend authority.
 *
 * No employee may approve or execute a monetary commitment above 0 SAR.
 * A spend request reaches the Chairman only after this chain, in order:
 * preparing department → Abdulrahman (finance) → Hares (governance) →
 * Sultan (recommendation) → Ahmad (Chairman) approves or rejects.
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
};

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
  | { action: "finance_review"; result: FinanceResult; note: string }
  | { action: "governance_review"; result: GovernanceResult; note: string }
  | { action: "sultan_recommendation"; result: SultanResult; note: string }
  | { action: "owner_decision"; decision: "APPROVED" | "REJECTED"; note?: string };

type ApprovalLike = {
  id?: string;
  title?: string;
  amount?: number | null;
  status?: string;
  metadata?: Record<string, unknown> | null;
};

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
  };
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
  return state.stage === "owner"
    && Boolean(state.financeReview)
    && Boolean(state.governanceReview)
    && Boolean(state.sultanRecommendation);
}

export type SpendStop = { by: "finance" | "governance" | "sultan"; result: string; note: string; at: string; label: string };

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
function pick(r: SpendReview) { return { result: r.result, note: r.note, at: r.at }; }

/** Items the Chairman can act on: a complete memo, or a stop that is waiting for him to close it. */
export function isChairmanActionable(state: SpendChainState | null): boolean {
  return isOwnerReadySpend(state) || Boolean(spendStop(state));
}

export function spendReviewHistory(state: SpendChainState | null) {
  if (!state) return [];
  const row = (stage: string, r: SpendReview | null) => r ? [{ stage, result: r.result, note: r.note, by: r.by, at: r.at }] : [];
  return [...row("finance", state.financeReview), ...row("governance", state.governanceReview), ...row("ceo", state.sultanRecommendation)];
}

export function approvalVisibleToChairman(item: ApprovalLike): boolean {
  if (!isMonetarySpend(item.amount)) return true;
  if (item.status && item.status !== "PENDING" && item.status !== "DEFERRED") return true;
  return isChairmanActionable(readSpendChain(item));
}

export function spendStageAgent(state: SpendChainState): string | null {
  if (state.decision || state.stage === "decided") return null;
  if (spendStop(state)) return SPEND_ACTORS.owner;
  if (state.stage === "department") return state.preparingAgentId;
  if (state.stage === "finance") return SPEND_ACTORS.finance;
  if (state.stage === "governance") return SPEND_ACTORS.governance;
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

  if (advance.action === "finance_review") {
    if (state.stage !== "finance") throw new Error("المراجعة المالية تأتي بعد تجهيز القسم، لا قبله ولا بعده.");
    if (actorId !== SPEND_ACTORS.finance) throw new Error("المراجعة المالية لعبدالرحمن فقط.");
    return {
      ...next,
      stage: advance.result === "غير موافق" ? "owner" : "governance",
      needsChainReview: false,
      financeReview: { result: advance.result, note: requireNote(advance.note, "المراجعة المالية"), by: actorId, at: now },
    };
  }

  if (advance.action === "governance_review") {
    if (state.stage !== "governance") throw new Error("فحص الحوكمة يأتي بعد المراجعة المالية.");
    if (actorId !== SPEND_ACTORS.governance) throw new Error("فحص الحوكمة لحارس فقط.");
    const review = { result: advance.result, note: requireNote(advance.note, "فحص الحوكمة"), by: actorId, at: now };
    if (advance.result === "موقوف") {
      return { ...next, stage: "owner", governanceReview: review, note: "موقوف من الحوكمة — بانتظار إقفال رئيس مجلس الإدارة. لا يُرفع لسلطان." };
    }
    return { ...next, stage: "sultan", governanceReview: review };
  }

  if (advance.action === "sultan_recommendation") {
    if (state.stage !== "sultan") throw new Error("توصية سلطان تأتي بعد فحص حارس.");
    if (actorId !== SPEND_ACTORS.sultan) throw new Error("التوصية النهائية لسلطان فقط، وليست اعتماداً.");
    if (!state.financeReview || !state.governanceReview) throw new Error("لا توصية قبل اكتمال المالية والحوكمة.");
    return {
      ...next,
      stage: "owner",
      sultanRecommendation: { result: advance.result, note: requireNote(advance.note, "توصية سلطان"), by: actorId, at: now },
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
