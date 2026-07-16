import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runPurchaseToPay } from "@/lib/employee-runtime/runtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runPurchaseToPay({
      tenantId: auth.context.tenantId,
      requestId: String(body.requestId || ""),
      supplierName: String(body.supplierName || ""),
      supplierEmail: body.supplierEmail
        ? String(body.supplierEmail)
        : undefined,
      itemName: String(body.itemName || ""),
      sku: String(body.sku || ""),
      quantity: Number(body.quantity || 0),
      unitPriceSAR: Number(body.unitPriceSAR || 0),
      taxSAR: Number(body.taxSAR || 0),
      leadTimeDays: Number(body.leadTimeDays || 7),
      qualityScore: Number(body.qualityScore || 80),
      received: body.received === true,
      paymentDueDate: body.paymentDueDate
        ? String(body.paymentDueDate)
        : undefined,
      approved: body.approved === true,
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
            : "Purchase-to-pay execution failed.",
        requestId: auth.context.requestId,
      },
      { status: 400 }
    );
  }
}
