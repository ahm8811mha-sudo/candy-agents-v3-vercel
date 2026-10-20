/** The government documents Government Relations tracks, by code. */
export const GOVERNMENT_DOCUMENT_TYPES = [
  "COMMERCIAL_REGISTRATION",
  "VAT_CERTIFICATE",
  "ZAKAT_TAX_CERTIFICATE",
  "CHAMBER_SUBSCRIPTION",
  "MUNICIPAL_LICENSE",
  "WORK_PERMIT",
  "INVESTMENT_LICENSE",
  "OTHER_GOVERNMENT_DOCUMENT",
] as const;

export type GovernmentDocumentType = (typeof GOVERNMENT_DOCUMENT_TYPES)[number];

export function isGovernmentDocumentType(value: unknown): value is GovernmentDocumentType {
  return typeof value === "string" && (GOVERNMENT_DOCUMENT_TYPES as readonly string[]).includes(value);
}
