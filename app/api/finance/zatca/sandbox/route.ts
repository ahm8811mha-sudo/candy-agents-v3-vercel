import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { buildZatcaQr, splitVatInclusive, VAT_RATE, type ZatcaInvoice } from "@/lib/company/zatca";
import { submitZatcaSandboxInvoice } from "@/lib/integrations/zatcaSandbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function invoiceNumber(reference?: string) {
  const safe = String(reference || "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return safe ? `SBX-${safe}` : `SBX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const gross = Number(body.gross);
    if (!Number.isFinite(gross) || gross <= 0) {
      return NextResponse.json({ ok: false, error: "إجمالي الفاتورة يجب أن يكون أكبر من صفر." }, { status: 400 });
    }

    const sellerName = String(body.sellerName || process.env.COMPANY_LEGAL_NAME || "").trim();
    const vatNumber = String(body.vatNumber || process.env.COMPANY_VAT_NUMBER || "").trim();
    if (!sellerName || !vatNumber) {
      return NextResponse.json({ ok: false, error: "اسم المنشأة والرقم الضريبي مطلوبان." }, { status: 400 });
    }

    const amounts = splitVatInclusive(gross);
    const issuedAt = new Date().toISOString();
    const invoice: ZatcaInvoice = {
      invoiceNumber: invoiceNumber(body.reference),
      issuedAt,
      sellerName,
      vatNumber,
      currency: "SAR",
      netAmount: amounts.net,
      vatAmount: amounts.vat,
      vatRate: VAT_RATE,
      totalAmount: amounts.gross,
      reference: body.reference ? String(body.reference) : undefined,
      qr: buildZatcaQr({
        sellerName,
        vatNumber,
        timestamp: issuedAt,
        invoiceTotal: amounts.gross,
        vatTotal: amounts.vat,
      }),
    };

    const submission = await submitZatcaSandboxInvoice(auth.context.tenantId, invoice);
    return NextResponse.json({
      ok: true,
      capability: "SANDBOX",
      invoice,
      submission: {
        ...submission.value,
        attemptId: submission.attemptId,
        receiptId: submission.receiptId || null,
        idempotent: submission.idempotent,
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, capability: "SANDBOX", error: error instanceof Error ? error.message : "تعذر إرسال فاتورة الاختبار." },
      { status: 500 }
    );
  }
}
