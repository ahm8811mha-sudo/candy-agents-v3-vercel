import { NextRequest, NextResponse } from "next/server";
import { AUTHORITY_MATRIX } from "@/lib/company/governance";
import {
  getEffectiveAgents,
  setAgentOverride,
  clearAgentOverride,
  hydrateAgentOverrides,
} from "@/lib/company/agentOverrides";
import { authenticateRequest } from "@/lib/auth";
import { canSignOff } from "@/lib/company/access";
import { recordAudit } from "@/lib/company/audit";

export const dynamic = "force-dynamic";

/** GET: the org structure (with owner customizations) + the authority matrix. */
export async function GET() {
  await hydrateAgentOverrides();
  return NextResponse.json({
    ok: true,
    agents: getEffectiveAgents(),
    matrix: AUTHORITY_MATRIX.map((r) => ({
      ...r,
      maxSAR: Number.isFinite(r.maxSAR) ? r.maxSAR : null,
    })),
  });
}

/** POST: customize an agent (rename / retitle / activate) — owner-tier action.
 *  Structure (ranks, authority limits, reporting lines) stays immutable. */
export async function POST(req: NextRequest) {
  try {
    await hydrateAgentOverrides();

    // Customizing the workforce is a T2 (owner) action under the matrix.
    const user = await authenticateRequest(req);
    const access = canSignOff(user?.role ?? null, "T2");
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.reason }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const agentId = String(body.agentId || "");
    if (!agentId) {
      return NextResponse.json({ ok: false, error: "يلزم agentId" }, { status: 400 });
    }

    if (body.action === "reset") {
      clearAgentOverride(agentId);
    } else {
      const updated = setAgentOverride({
        agentId,
        name: body.name !== undefined ? String(body.name) : undefined,
        title: body.title !== undefined ? String(body.title) : undefined,
        active: body.active !== undefined ? Boolean(body.active) : undefined,
      });
      if (!updated) {
        return NextResponse.json(
          { ok: false, error: "الوكيل غير موجود، أو لا يمكن تعديل المالك." },
          { status: 400 }
        );
      }
    }

    recordAudit({
      actor: user?.name || "المالك",
      role: user?.role,
      action: "CUSTOMIZE_AGENT",
      entityType: "agent",
      entityId: agentId,
      detail:
        body.action === "reset"
          ? `إعادة الوكيل ${agentId} إلى الوضع الافتراضي`
          : `تخصيص الوكيل ${agentId}: ${[body.name && `الاسم=${body.name}`, body.title && `المسمى=${body.title}`, body.active !== undefined && `نشط=${body.active}`].filter(Boolean).join(" · ")}`,
      tier: "T2",
    });

    return NextResponse.json({ ok: true, agents: getEffectiveAgents() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Agent customization failed" },
      { status: 500 }
    );
  }
}
