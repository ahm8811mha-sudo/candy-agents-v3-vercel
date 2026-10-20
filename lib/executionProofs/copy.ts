/**
 * What the proof form and the proof view say. Pure, so both share one wording.
 */

import type { AttestedFacts, ProofFactKey, ProofFlag } from "./facts";

export const FACT_LABELS: Record<ProofFactKey, string> = {
  documentKind: "نوع المستند",
  reference: "رقم المستند أو المرجع",
  issuer: "الجهة المصدرة",
  parties: "صاحب المستند أو أطرافه",
  issueDate: "تاريخ الإصدار",
  expiryDate: "تاريخ الانتهاء",
  amount: "المبلغ",
  currency: "العملة",
};

export const READING_LABELS: Record<"READ" | "NOT_READ" | "FAILED", string> = {
  READ: "قُرئ آلياً",
  NOT_READ: "لم تُقرأ البيانات آلياً",
  FAILED: "تعذرت القراءة الآلية",
};

const number = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 1 });
const riyals = new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR", maximumFractionDigits: 2 });

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${number.format(bytes)} بايت`;
  if (bytes < 1024 * 1024) return `${number.format(bytes / 1024)} كيلوبايت`;
  return `${number.format(bytes / (1024 * 1024))} ميجابايت`;
}

export function confidenceText(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function flagMessage(
  flag: ProofFlag,
  facts: AttestedFacts,
  company: { legalName: string | null; approvedFundingSAR: number | null; today: string }
): string {
  if (flag.code === "HOLDER_NOT_COMPANY") return `صاحب المستند «${facts.parties}» لا يطابق اسم الشركة المسجل «${company.legalName}».`;
  if (flag.code === "EXPIRED") return `تاريخ الانتهاء ${facts.expiryDate} سابق لتاريخ اليوم ${company.today}.`;
  const amount = [facts.amount, facts.currency].filter(Boolean).join(" ");
  return `المبلغ ${amount} يختلف عن التمويل المعتمد لهذه الخطوة، وهو ${riyals.format(company.approvedFundingSAR || 0)}.`;
}
