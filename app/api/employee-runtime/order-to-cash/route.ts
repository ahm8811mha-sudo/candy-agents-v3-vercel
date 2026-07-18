import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  resolveEmployeeRuntimeMode,
  runOrderToCash,
} from "@/lib/employee-runtime/runtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const mode = resolveEmployeeRuntimeMode();
    const paymentEventId =
      req.headers.get("x-orvanta-payment-event-id")?.trim() || "";
    const trustedLivePayment =
      mode === "LIVE" &&
      process.env.PAYMENT_CONNECTOR_VERIFIED === "true" &&
      auth.context.systemCall &&
      Boolean(paymentEventId);

    if (mode === "LIVE" && !trustedLivePayment) {
      return NextResponse.json(
        {
          ok: false,
          code: "PAYMENT_CONNECTOR_REQUIRED",
          error:
            "Live Order-to-Cash requires a trusted server payment event. Configure PAYMENT_CONNECTOR_VERIFIED=true and call with the internal API key plus x-orvanta-payment-event-id.",
          requestId: auth.context.requestId,
        },
        { status: 503 }
      );
    }

    const result = await runOrderToCash({
      tenantId: auth.context.tenantId,
      orderId: String(body.orderId || ""),
      customerName: String(body.customerName || ""),
      customerEmail: body.customerEmail
        ? String(body.customerEmail)
        : undefined,
      productName: String(body.productName || ""),
      sku: String(body.sku || ""),
      quantity: Number(body.quantity || 0),
      amountSAR: Number(body.amountSAR || 0),
      taxSAR: Number(body.taxSAR || 0),
      unitCostSAR: Number(body.unitCostSAR || 0),
      minimumMarginPercent: Number(body.minimumMarginPercent || 20),
      paymentConfirmed:
        mode === "LIVE" ? trustedLivePayment : body.paymentConfirmed === true,
      paymentReference:
        mode === "LIVE"
          ? paymentEventId
          : body.paymentReference
            ? String(body.paymentReference)
            : undefined,
      channel: body.channel ? String(body.channel) : "direct",
      requestedBy: auth.context.actor.name,
      unavailableEmployeeIds: Array.isArray(body.unavailableEmployeeIds)
        ? body.unavailableEmployeeIds.map(String)
        : [],
    });
    return NextResponse.json(
      { ok: true, ...result, requestId: auth.context.requestId },
      { status: result.reused ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Order-to-cash execution failed.",
        requestId: auth.context.requestId,
      },
      { status: 400 }
    );
  }
}
