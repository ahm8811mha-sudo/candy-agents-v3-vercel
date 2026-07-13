import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import { buildZatcaQr, VAT_RATE, type ZatcaInvoice } from "../company/zatca";
import { executeIntegrationOnce } from "../operations/integrationExecution";

export class ZatcaSandboxConfigurationError extends Error {
  constructor() {
    super("ZATCA sandbox is not configured. Set ZATCA_SANDBOX_ENABLED, ZATCA_SANDBOX_URL, and ZATCA_SANDBOX_TOKEN.");
    this.name = "ZatcaSandboxConfigurationError";
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function validateVatNumber(value: string) {
  return /^3\d{13}3$/.test(value);
}

function assertInvoice(invoice: ZatcaInvoice) {
  if (!invoice.invoiceNumber.trim()) throw new Error("Invoice number is required.");
  if (!invoice.sellerName.trim()) throw new Error("Seller name is required.");
  if (!validateVatNumber(invoice.vatNumber)) throw new Error("Saudi VAT number must contain 15 digits and start/end with 3.");
  if (invoice.currency !== "SAR") throw new Error("The current ZATCA sandbox flow supports SAR only.");
  if (round2(invoice.netAmount + invoice.vatAmount) !== round2(invoice.totalAmount)) {
    throw new Error("Invoice total does not equal net plus VAT.");
  }
  if (round2(invoice.vatRate) !== round2(VAT_RATE)) throw new Error("Unexpected VAT rate.");
  const issuedAt = new Date(invoice.issuedAt);
  if (!Number.isFinite(issuedAt.getTime())) throw new Error("Invalid invoice timestamp.");
}

function sandboxConfiguration() {
  const enabled = process.env.ZATCA_SANDBOX_ENABLED === "true";
  const url = process.env.ZATCA_SANDBOX_URL?.trim();
  const token = process.env.ZATCA_SANDBOX_TOKEN?.trim();
  if (!enabled || !url || !token) throw new ZatcaSandboxConfigurationError();
  return { url, token };
}

function invoiceHash(invoice: ZatcaInvoice) {
  return createHash("sha256").update(JSON.stringify(invoice)).digest("hex");
}

export async function persistZatcaInvoice(tenantId: string, invoice: ZatcaInvoice) {
  assertInvoice(invoice);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for ZATCA invoices.");
  const expectedQr = buildZatcaQr({
    sellerName: invoice.sellerName,
    vatNumber: invoice.vatNumber,
    timestamp: invoice.issuedAt,
    invoiceTotal: invoice.totalAmount,
    vatTotal: invoice.vatAmount,
  });
  if (invoice.qr !== expectedQr) throw new Error("The invoice QR payload does not match the invoice values.");

  const { error } = await supabase.from("zatca_invoices").upsert({
    tenant_id: tenantId,
    invoice_number: invoice.invoiceNumber,
    issued_at: invoice.issuedAt,
    seller_name: invoice.sellerName,
    vat_number: invoice.vatNumber,
    currency: invoice.currency,
    net_amount: invoice.netAmount,
    vat_amount: invoice.vatAmount,
    vat_rate: invoice.vatRate,
    total_amount: invoice.totalAmount,
    reference: invoice.reference || null,
    qr: invoice.qr,
  }, { onConflict: "invoice_number" });
  if (error) throw error;
  return invoice;
}

export async function submitZatcaSandboxInvoice(tenantId: string, invoice: ZatcaInvoice) {
  assertInvoice(invoice);
  await persistZatcaInvoice(tenantId, invoice);
  const { url, token } = sandboxConfiguration();
  const hash = invoiceHash(invoice);

  return executeIntegrationOnce({
    tenantId,
    integration: "ZATCA_SANDBOX",
    operation: "invoice.submit",
    idempotencyKey: invoice.invoiceNumber,
    request: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceHash: hash,
      issuedAt: invoice.issuedAt,
      totalAmount: invoice.totalAmount,
      vatAmount: invoice.vatAmount,
    },
    maxAttempts: 5,
    execute: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "x-idempotency-key": invoice.invoiceNumber,
          },
          body: JSON.stringify({ invoice, invoiceHash: hash, mode: "SANDBOX" }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = typeof payload?.message === "string" ? payload.message : `ZATCA sandbox returned HTTP ${response.status}`;
          throw new Error(message);
        }
        const externalId = String(payload?.uuid || payload?.invoiceId || payload?.id || invoice.invoiceNumber);
        return {
          value: {
            mode: "SANDBOX",
            accepted: true,
            externalId,
            response: payload,
          },
          externalId,
          responseCode: response.status,
          receiptType: "ZATCA_SANDBOX_RESPONSE",
          receipt: {
            accepted: true,
            invoiceHash: hash,
            response: payload,
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
