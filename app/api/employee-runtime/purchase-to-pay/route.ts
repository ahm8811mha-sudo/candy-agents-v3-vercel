import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runPurchaseToPay } from "@/lib/employee-runtime/runtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const quantity = Number(body.quantity || 0);
    const unitPriceSAR = Number(body.unitPriceSAR || 0);
    const taxSAR = Number(body.taxSAR || 0);
    const leadTimeDays = Number(body.leadTimeDays || 7);
    const qualityScore = Math.min(
      100,
      Math.max(0, Number(body.qualityScore || 80))
    );
    const totalSAR = quantity * unitPriceSAR + taxSAR;
    const supplierScore =
      qualityScore * 0.6 +
      Math.max(0, 100 - leadTimeDays * 3) * 0.25 +
      (totalSAR > 0 ? 15 : 0);

    if (Number.isFinite(supplierScore) && supplierScore < 60) {
      throw new Error(
        `Supplier score is ${Math.round(
          supplierScore
        )}%. A purchase order cannot be created below 60%.`
      );
    }

    const result = await runPurchaseToPay({
      tenantId: auth.context.tenantId,
      requestId: String(body.requestId || ""),
      supplierName: String(body.supplierName || ""),
      supplierEmail: body.supplierEmail
        ? String(body.supplierEmail)
        : undefined,
      itemName: String(body.itemName || ""),
      sku: String(body.sku || ""),
      quantity,
      unitPriceSAR,
      taxSAR,
      leadTimeDays,
      qualityScore,
      received: body.received === true,
      paymentDueDate: body.paymentDueDate
        ? String(body.paymentDueDate)
        : undefined,
      // T0 is authorized by policy, not by a browser checkbox. Larger
      // commitments must stop at WAITING_APPROVAL and use the approval API.
      approved:
        Number.isFinite(totalSAR) && totalSAR > 0 && totalSAR <= 5_000,
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
