import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  getOwnerAbsencePolicy,
  listContinuityEvents,
  saveOwnerAbsencePolicy,
} from "@/lib/company/ownerAbsence";
import { DEFAULT_PROHIBITED_OWNER_ABSENCE_ACTIONS } from "@/lib/company/ownerAbsencePolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const optionalDateTime = z.union([z.string().datetime({ offset: true }), z.null()]).optional();

const policySchema = z.object({
  status: z.enum(["INACTIVE", "SCHEDULED", "ACTIVE", "PAUSED"]),
  startsAt: optionalDateTime,
  endsAt: optionalDateTime,
  strategicGuidance: z.string().trim().min(20).max(4_000),
  prohibitedActions: z.array(z.string().trim().min(2).max(80)).max(30)
    .default([...DEFAULT_PROHIBITED_OWNER_ABSENCE_ACTIONS]),
  routineAutoLimitSAR: z.number().finite().min(0).max(10_000_000),
  executiveAgentLimitSAR: z.number().finite().min(0).max(100_000_000),
  maxAutonomousRisk: z.enum(["LOW", "MEDIUM"]),
  allowExternalActions: z.boolean(),
  requireCompletionEvidence: z.boolean(),
  delegatedHumanName: z.string().trim().max(160).nullable().optional(),
  delegatedHumanContact: z.string().trim().max(240).nullable().optional(),
  dailyBriefHour: z.number().int().min(0).max(23),
});

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;

  try {
    const [policy, events] = await Promise.all([
      getOwnerAbsencePolicy(auth.context.tenantId),
      listContinuityEvents(auth.context.tenantId, 20),
    ]);
    return NextResponse.json({
      ok: true,
      policy,
      events,
      canManage: auth.context.actor.role === "OWNER",
      requestId: auth.context.requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "تعذر تحميل سياسة غياب المالك.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;
  if (auth.context.actor.role !== "OWNER") {
    return NextResponse.json(
      {
        ok: false,
        code: "OWNER_ROLE_REQUIRED",
        error: "تغيير ميثاق الغياب والتوجيه الاستراتيجي محصور بحساب المالك.",
        requestId: auth.context.requestId,
      },
      { status: 403 }
    );
  }

  try {
    const parsed = policySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_OWNER_ABSENCE_POLICY",
          error: parsed.error.issues[0]?.message || "بيانات سياسة الغياب غير صحيحة.",
          requestId: auth.context.requestId,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const input = parsed.data;
    const policy = await saveOwnerAbsencePolicy(auth.context.tenantId, {
      ...input,
      startsAt: input.status === "ACTIVE" && !input.startsAt ? now : input.startsAt,
      updatedBy: `${auth.context.actor.name} (${auth.context.actor.id})`,
    });
    return NextResponse.json({ ok: true, policy, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "تعذر حفظ سياسة غياب المالك.",
        requestId: auth.context.requestId,
      },
      { status: 409 }
    );
  }
}
