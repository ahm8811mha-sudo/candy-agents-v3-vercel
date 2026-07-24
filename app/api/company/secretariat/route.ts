import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  advanceCommitment,
  listDecisionCommitments,
  openDecisionCommitment,
  secretariatBrief,
  type AdvanceInput,
} from "@/lib/company/executiveSecretariat";

export const dynamic = "force-dynamic";

/** The Executive Secretariat board: open commitments + the owner brief. */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    const includeClosed = req.nextUrl.searchParams.get("includeClosed") === "true";
    const [commitments, brief] = await Promise.all([
      listDecisionCommitments({ tenantId: auth.context.tenantId, includeClosed }),
      secretariatBrief(auth.context.tenantId),
    ]);
    return NextResponse.json({ ok: true, commitments, brief, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Secretariat load failed", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}

/** Assign / advance / complete a commitment, or open one manually. */
export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "advance");
    const tenantId = auth.context.tenantId;
    const actor = auth.context.actor.name;

    if (action === "open") {
      const result = await openDecisionCommitment(
        {
          sourceType: String(body.sourceType || "manual"),
          sourceId: String(body.sourceId || `manual-${Date.now()}`),
          title: String(body.title || ""),
          detail: body.detail ? String(body.detail) : undefined,
          priority: body.priority,
          assigneeId: body.assigneeId ? String(body.assigneeId) : undefined,
          assigneeName: body.assigneeName ? String(body.assigneeName) : undefined,
          decidedBy: actor,
          dueInDays: body.dueInDays ? Number(body.dueInDays) : undefined,
          requiresProof: Boolean(body.requiresProof),
        },
        { tenantId, actor }
      );
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    const input: AdvanceInput = {
      id: String(body.id || ""),
      status: body.status,
      assigneeId: body.assigneeId ? String(body.assigneeId) : undefined,
      assigneeName: body.assigneeName ? String(body.assigneeName) : undefined,
      priority: body.priority,
      dueAt: body.dueAt ? String(body.dueAt) : undefined,
      completionNote: body.completionNote ? String(body.completionNote) : undefined,
      proof: body.proof ? String(body.proof) : undefined,
      linkedEntityType: body.linkedEntityType ? String(body.linkedEntityType) : undefined,
      linkedEntityId: body.linkedEntityId ? String(body.linkedEntityId) : undefined,
    };
    if (!input.id) return NextResponse.json({ ok: false, error: "يلزم معرّف الالتزام (id)." }, { status: 400 });
    const result = await advanceCommitment(input, { tenantId, actor });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Secretariat action failed", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}
