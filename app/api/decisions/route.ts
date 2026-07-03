import { NextRequest, NextResponse } from "next/server";
import { recordDecision, listDecisions, decisionMap, decisionStats, hydrateDecisions, type DecisionAction } from "@/lib/decisions";

export const dynamic = "force-dynamic";

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

    return NextResponse.json({ ok: true, record, map: decisionMap(), stats: decisionStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Decision failed" },
      { status: 500 }
    );
  }
}
