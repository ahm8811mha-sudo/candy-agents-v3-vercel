export type BudgetState = {
  approvedSAR: number;
  committedSAR: number;
  consumedSAR: number;
  releasedSAR: number;
};

export type ReconciliationInput = {
  expectedAmountSAR?: number;
  actualAmountSAR?: number;
  expectedExternalReference?: string;
  actualExternalReference?: string;
  ledgerBalanced: boolean;
  receiptPresent: boolean;
};

export function availableBudgetSAR(state: BudgetState) {
  return Math.max(0, state.approvedSAR - state.committedSAR - state.consumedSAR + state.releasedSAR);
}

export function canReserveBudget(state: BudgetState, requestedSAR: number) {
  if (!Number.isFinite(requestedSAR) || requestedSAR <= 0) {
    return { allowed: false, reason: "Requested commitment must be a positive SAR amount." };
  }
  const available = availableBudgetSAR(state);
  return requestedSAR <= available
    ? { allowed: true, reason: "Budget is available.", availableSAR: available }
    : { allowed: false, reason: "Requested commitment exceeds available budget.", availableSAR: available };
}

export function reconcileExecution(input: ReconciliationInput) {
  const amountMatches =
    input.expectedAmountSAR == null ||
    input.actualAmountSAR == null ||
    Math.abs(input.expectedAmountSAR - input.actualAmountSAR) < 0.01;
  const referenceMatches =
    !input.expectedExternalReference ||
    !input.actualExternalReference ||
    input.expectedExternalReference === input.actualExternalReference;

  const exceptions: string[] = [];
  if (!amountMatches) exceptions.push("AMOUNT_MISMATCH");
  if (!referenceMatches) exceptions.push("REFERENCE_MISMATCH");
  if (!input.ledgerBalanced) exceptions.push("UNBALANCED_LEDGER");
  if (!input.receiptPresent) exceptions.push("MISSING_EXTERNAL_RECEIPT");

  return {
    reconciled: exceptions.length === 0,
    exceptions,
    status: exceptions.length === 0 ? "RECONCILED" as const : "EXCEPTION" as const,
  };
}

export function assertBalancedJournal(lines: Array<{ debitSAR: number; creditSAR: number }>) {
  const debit = lines.reduce((sum, line) => sum + Number(line.debitSAR || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.creditSAR || 0), 0);
  if (Math.abs(debit - credit) >= 0.01) {
    throw new Error(`Unbalanced journal: debit ${debit.toFixed(2)} SAR, credit ${credit.toFixed(2)} SAR.`);
  }
  return { balanced: true, debitSAR: debit, creditSAR: credit };
}

export const FINANCIAL_CONTROL_INVARIANTS = [
  "لا تنفيذ مادي بلا ميزانية متاحة أو التزام محجوز.",
  "لا نشر لقيد غير متوازن.",
  "لا اعتبار الإجراء مكتملاً بلا إيصال أو مرجع خارجي قابل للتحقق.",
  "لا تعتبر تقارير الأقسام مصدراً مالياً إذا تعارضت مع دفتر الأستاذ.",
  "كل توقع يجب أن يحفظ افتراضاته وإصداره وانحرافه عن الفعلي.",
];
