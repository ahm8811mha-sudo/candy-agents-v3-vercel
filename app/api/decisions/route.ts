import { NextRequest, NextResponse } from "next/server";
import { recordDecision, listDecisions, decisionMap, decisionStats, hydrateDecisions, type DecisionAction } from "@/lib/decisions";
import { openDecisionCommitment, type CommitmentPriority } from "@/lib/company/executiveSecretariat";

export const dynamic = "force-dynamic";

// The secretariat only tracks decisions that require follow-through.
const FOLLOW_THROUGH_ACTIONS: DecisionAction[] = ["APPROVED", "FORWARDED"];

const VALID_ACTIONS: DecisionAction[] = ["APPROVED", "REJECTED", "NOTED", "FORWARDED"];

/** GET: decisions list + a {sourceType:sourceId → latest} map for UI lookups. */
export async function GET(req: NextRequest) {
  await hydrateDecisions();
  const sourceType = req.nextUrl.searchParams.get("sourceType") || undefined;
  return NextResponse.json({
    ok: true,
    decisions: listDecisions(sourceType),
    map: decisionMap(sourceType),
    stats: decisionStats(),
  });
}

/** POST: record an action (approve / reject / note / forward) on an item. */
export async function POST(req: NextRequest) {
  try {
    await hydrateDecisions();
    const body = await req.json().catch(() => ({}));
    const action = body.action as DecisionAction;

    if (!body.sourceType || !body.sourceId || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { ok: false, error: "يلزم sourceType و sourceId و action صالح (APPROVED/REJECTED/NOTED/FORWARDED)" },
        { status: 400 }
      );
    }
    if (action === "FORWARDED" && !body.forwardedTo) {
      return NextResponse.json({ ok: false, error: "الإحالة تتطلب تحديد القسم (forwardedTo)" }, { status: 400 });
    }
    if (action === "NOTED" && !body.note) {
      return NextResponse.json({ ok: false, error: "الملاحظة تتطلب نصاً (note)" }, { status: 400 });
    }

    const record = recordDecision({
      sourceType: String(body.sourceType),
      sourceId: String(body.sourceId),
      title: String(body.title || body.sourceId),
      action,
      note: body.note ? String(body.note) : undefined,
      forwardedTo: body.forwardedTo ? String(body.forwardedTo) : undefined,
      decidedBy: String(body.decidedBy || "CEO"),
    });

    // The Executive Secretariat catches every follow-through decision the
    // instant it is issued, so it can never fall off the radar. A missing
    // owner does not block the decision — the commitment opens as "needs owner".
    let commitment = null;
    if (FOLLOW_THROUGH_ACTIONS.includes(action)) {
      const result = await openDecisionCommitment({
        decisionId: record.id,
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        title: record.title,
        detail: record.note,
        decidedBy: record.decidedBy,
        priority: (body.priority as CommitmentPriority) || "MEDIUM",
        assigneeId: body.assigneeId ? String(body.assigneeId) : undefined,
        assigneeName: body.assigneeName || record.forwardedTo || undefined,
        dueInDays: body.dueInDays ? Number(body.dueInDays) : undefined,
        requiresProof: Boolean(body.requiresProof),
      });
      commitment = result.commitment;
    }

    return NextResponse.json({ ok: true, record, commitment, map: decisionMap(), stats: decisionStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Decision failed" },
      { status: 500 }
    );
  }
}
