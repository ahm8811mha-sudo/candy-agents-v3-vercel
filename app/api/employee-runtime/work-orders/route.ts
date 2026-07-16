import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { executeWorkOrder, getWorkOrder, listWorkOrders, saveWorkOrder } from "@/lib/employee-runtime/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const workOrders = await listWorkOrders(auth.context.tenantId, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50);
    return NextResponse.json({ ok: true, workOrders, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to list work orders.", requestId: auth.context.requestId }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const action = String(body.action || "").toUpperCase();
    const current = await getWorkOrder(id, auth.context.tenantId);
    if (!current) return NextResponse.json({ ok: false, error: "Work order not found.", requestId: auth.context.requestId }, { status: 404 });

    if (action === "APPROVE") {
      const approved = await saveWorkOrder({ ...current, approvalStatus: "APPROVED", status: "READY", error: null });
      const workOrder = await executeWorkOrder(approved, auth.context.actor.name, Array.isArray(body.unavailableEmployeeIds) ? body.unavailableEmployeeIds.map(String) : []);
      return NextResponse.json({ ok: true, workOrder, requestId: auth.context.requestId });
    }
    if (action === "RETRY" || action === "RESUME") {
      const workOrder = await executeWorkOrder(current, auth.context.actor.name, Array.isArray(body.unavailableEmployeeIds) ? body.unavailableEmployeeIds.map(String) : []);
      return NextResponse.json({ ok: true, workOrder, requestId: auth.context.requestId });
    }
    if (action === "CANCEL") {
      if (current.status === "DONE") return NextResponse.json({ ok: false, error: "A completed work order cannot be cancelled.", requestId: auth.context.requestId }, { status: 409 });
      const workOrder = await saveWorkOrder({ ...current, status: "CANCELLED", error: body.reason ? String(body.reason) : "Cancelled by manager." });
      return NextResponse.json({ ok: true, workOrder, requestId: auth.context.requestId });
    }
    return NextResponse.json({ ok: false, error: "Supported actions: APPROVE, RETRY, RESUME, CANCEL.", requestId: auth.context.requestId }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update work order.", requestId: auth.context.requestId }, { status: 500 });
  }
}
