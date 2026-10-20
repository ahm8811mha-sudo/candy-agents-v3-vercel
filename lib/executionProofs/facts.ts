/**
 * The facts a proof carries, and how they are compared with the company's
 * records. Pure: no I/O and no server imports, so the confirmation form runs
 * the same comparison in the browser as the server does in its view.
 */

export const PROOF_FACT_KEYS = ["documentKind", "reference", "issuer", "parties", "issueDate", "expiryDate", "amount", "currency"] as const;
export type ProofFactKey = (typeof PROOF_FACT_KEYS)[number];
export type ReadFact = { value: string; confidence: number };
export type MergedFacts = Partial<Record<ProofFactKey, ReadFact & { fileId: string }>>;
export type AttestedFacts = Partial<Record<ProofFactKey, string>>;
export type ProofFlag = { code: "HOLDER_NOT_COMPANY" | "EXPIRED" | "AMOUNT_DIFFERS"; fact: ProofFactKey };

/** Arabic-Indic and Persian digits to Latin; the Arabic decimal and thousands marks to "." and ",". */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

export function normalizeAmount(value: string): string {
  const match = normalizeDigits(value).replace(/[,\s]/g, "").match(/\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

/**
 * A date only when it is unambiguous and Gregorian (year, month, day). A Hijri
 * date, or a day-first one, is left for the owner to type, never guessed.
 */
export function normalizeDate(value: string): string {
  const text = normalizeDigits(value).trim();
  if (/هـ|هجري|\bAH\b/i.test(text)) return "";
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return "";
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1900 || year > 2200) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A proof file Government Relations may track: read as a government document,
 * and sure of its kind. Only a read file qualifies, so while reading is off
 * (owner decision, 2026-10-20) no proof is ever handed on.
 */
export function isGovernmentTrackable(reading: { governmentType: string | null; facts: { documentKind?: { confidence: number } } }): boolean {
  return Boolean(reading.governmentType) && (reading.facts.documentKind?.confidence ?? 0) >= 0.7;
}

function normalizeName(value: string): string {
  return normalizeDigits(value)
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isSaudiRiyal(currency: string): boolean {
  const key = normalizeDigits(currency).toLowerCase().replace(/[\s.]/g, "");
  return ["sar", "sr", "رس", "ريال", "ريالسعودي", "﷼"].includes(key);
}

/**
 * Disagreements with what the company already knows. Warnings, not refusals
 * (owner decision, 2026-10-20): the owner may still confirm.
 */
export function compareWithCompany(
  facts: AttestedFacts,
  company: { legalName: string | null; approvedFundingSAR: number | null; today: string }
): ProofFlag[] {
  const flags: ProofFlag[] = [];
  const parties = normalizeName(facts.parties || "");
  const legalName = normalizeName(company.legalName || "");
  if (parties && legalName && !parties.includes(legalName) && !legalName.includes(parties)) {
    flags.push({ code: "HOLDER_NOT_COMPANY", fact: "parties" });
  }
  const expiry = normalizeDate(facts.expiryDate || "");
  if (expiry && expiry < company.today) flags.push({ code: "EXPIRED", fact: "expiryDate" });
  const amount = Number(normalizeAmount(facts.amount || ""));
  if (company.approvedFundingSAR != null && company.approvedFundingSAR > 0 && amount > 0) {
    const otherCurrency = Boolean(facts.currency?.trim()) && !isSaudiRiyal(facts.currency || "");
    if (otherCurrency || Math.abs(amount - company.approvedFundingSAR) > company.approvedFundingSAR * 0.01) {
      flags.push({ code: "AMOUNT_DIFFERS", fact: "amount" });
    }
  }
  return flags;
}
