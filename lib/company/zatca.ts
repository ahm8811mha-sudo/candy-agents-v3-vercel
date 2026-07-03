/**
 * F4 — ZATCA-compliant VAT + simplified e-invoice (docs/ROADMAP.md).
 *
 * Saudi VAT is 15% and retail prices are VAT-inclusive. This module splits a
 * gross amount into net + VAT, and builds a ZATCA Phase-1 simplified invoice
 * including the mandatory base64 TLV QR payload (tags 1–5: seller name, VAT
 * number, timestamp, invoice total, VAT total). Pure and testable.
 */

export const VAT_RATE = 0.15;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Split a VAT-inclusive gross into net + VAT (VAT = gross − net). */
export function splitVatInclusive(gross: number): { net: number; vat: number; gross: number } {
  const g = round2(Math.max(0, gross));
  const net = round2(g / (1 + VAT_RATE));
  const vat = round2(g - net);
  return { net, vat, gross: g };
}

/** ZATCA Phase-1 QR: base64 of concatenated TLV (tag, length, UTF-8 value). */
export function buildZatcaQr(params: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  invoiceTotal: number;
  vatTotal: number;
}): string {
  const fields = [
    { tag: 1, value: params.sellerName },
    { tag: 2, value: params.vatNumber },
    { tag: 3, value: params.timestamp },
    { tag: 4, value: params.invoiceTotal.toFixed(2) },
    { tag: 5, value: params.vatTotal.toFixed(2) },
  ];
  const chunks: Buffer[] = [];
  for (const f of fields) {
    const val = Buffer.from(f.value, "utf8");
    chunks.push(Buffer.from([f.tag, val.length]), val);
  }
  return Buffer.concat(chunks).toString("base64");
}

export type ZatcaInvoice = {
  invoiceNumber: string;
  issuedAt: string;
  sellerName: string;
  vatNumber: string;
  currency: string;
  netAmount: number;
  vatAmount: number;
  vatRate: number;
  totalAmount: number;
  reference?: string;
  qr: string;
};

const invoices: ZatcaInvoice[] = [];

let counter = 0;
function invoiceNumber(): string {
  counter += 1;
  const y = new Date().getFullYear();
  return `INV-${y}-${String(counter).padStart(5, "0")}`;
}

export function buildInvoice(input: { gross: number; currency?: string; reference?: string; sellerName?: string; vatNumber?: string }): ZatcaInvoice {
  const { net, vat, gross } = splitVatInclusive(input.gross);
  const issuedAt = new Date().toISOString();
  const sellerName = input.sellerName || process.env.COMPANY_LEGAL_NAME || "شركة النجمة الذهبية";
  const vatNumber = input.vatNumber || process.env.COMPANY_VAT_NUMBER || "300000000000003";

  const invoice: ZatcaInvoice = {
    invoiceNumber: invoiceNumber(),
    issuedAt,
    sellerName,
    vatNumber,
    currency: input.currency || "SAR",
    netAmount: net,
    vatAmount: vat,
    vatRate: VAT_RATE,
    totalAmount: gross,
    reference: input.reference,
    qr: buildZatcaQr({ sellerName, vatNumber, timestamp: issuedAt, invoiceTotal: gross, vatTotal: vat }),
  };
  invoices.unshift(invoice);
  return invoice;
}

export function listInvoices(limit = 50): ZatcaInvoice[] {
  return invoices.slice(0, limit);
}

/** Test helper. */
export function _clearInvoices(): void {
  invoices.length = 0;
  counter = 0;
}
