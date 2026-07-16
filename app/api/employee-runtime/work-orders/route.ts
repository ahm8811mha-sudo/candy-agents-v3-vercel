import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  executeWorkOrder,
  getWorkOrder,
  listWorkOrders,
  saveWorkOrder,
} from "@/lib/employee-runtime/runtime";
import type { ApprovalTier } from "@/lib/company/governance";
import type { UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

function canApproveTier(
  role: UserRole,
  tier: ApprovalTier,
  feasibilityConfirmed: boolean
) {
  if (tier === "T0" || tier === "T1") {
    return ["ADMIN", "OWNER", "CEO"].includes(role);
  }
  if (tier === "T2") {
    return role === "ADMIN" || role === "OWNER";
  }
  return (
    (role === "ADMIN" || role === "OWNER") && feasibilityConfirmed
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const workOrders = await listWorkOrders(
      auth.context.tenantId,
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50
    );
    return NextResponse.json({
      ok: true,
      workOrders,
      requestId: auth.context.requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to list work orders.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const action = String(body.action || "").toUpperCase();
    const unavailableEmployeeIds = Array.isArray(body.unavailableEmployeeIds)
      ? body.unavailableEmployeeIds.map(String)
      : [];
    const current = await getWorkOrder(id, auth.context.tenantId);
    if (!current) {
      return NextResponse.json(
        {
          ok: false,
          error: "Work order not found.",
          requestId: auth.context.requestId,
        },
        { status: 404 }
      );
    }

    if (action === "APPROVE") {
      if (current.status !== "WAITING_APPROVAL") {
        return NextResponse.json(
          {
            ok: false,
            error: "Only a work order waiting for approval can be approved.",
            requestId: auth.context.requestId,
          },
          { status: 409 }
        );
      }
      const feasibilityConfirmed = body.feasibilityConfirmed === true;
      if (
        !canApproveTier(
          auth.context.actor.role,
          current.approvalTier,
          feasibilityConfirmed
        )
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              current.approvalTier === "T3" && !feasibilityConfirmed
                ? "T3 requires owner approval and a confirmed three-department feasibility study."
                : `Role ${auth.context.actor.role} cannot approve ${current.approvalTier}.`,
            requestId: auth.context.requestId,
          },
          { status: 403 }
        );
      }
      const priorApprovals = Array.isArray(current.context.approvals)
        ? current.context.approvals
        : [];
      const approved = await saveWorkOrder({
        ...current,
        approvalStatus: "APPROVED",
        status: "READY",
        error: null,
        context: {
          ...current.context,
          approvals: [
            ...priorApprovals,
            {
              actorId: auth.context.actor.id,
              actorName: auth.context.actor.name,
              actorRole: auth.context.actor.role,
              tier: current.approvalTier,
              feasibilityConfirmed,
              approvedAt: new Date().toISOString(),
              requestId: auth.context.requestId,
            },
          ],
        },
      });
      const workOrder = await executeWorkOrder(
        approved,
        auth.context.actor.name,
        unavailableEmployeeIds
      );
      return NextResponse.json({
        ok: true,
        workOrder,
        requestId: auth.context.requestId,
      });
    }

    if (action === "RETRY" || action === "RESUME") {
      const workOrder = await executeWorkOrder(
        current,
        auth.context.actor.name,
        unavailableEmployeeIds
      );
      return NextResponse.json({
        ok: true,
        workOrder,
        requestId: auth.context.requestId,
      });
    }

    if (action === "CANCEL") {
      if (current.status === "DONE") {
        return NextResponse.json(
          {
            ok: false,
            error: "A completed work order cannot be cancelled.",
            requestId: auth.context.requestId,
          },
          { status: 409 }
        );
      }
      const workOrder = await saveWorkOrder({
        ...current,
        status: "CANCELLED",
        error: body.reason
          ? String(body.reason)
          : "Cancelled by manager.",
      });
      return NextResponse.json({
        ok: true,
        workOrder,
        requestId: auth.context.requestId,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Supported actions: APPROVE, RETRY, RESUME, CANCEL.",
        requestId: auth.context.requestId,
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update work order.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}
