import { NextRequest, NextResponse } from "next/server";
import {
  submitIdea,
  listIdeas,
  ideaStats,
  ensureDailyIdea,
  addRecommendation,
  type Verdict,
} from "@/lib/company/ideas";

export const dynamic = "force-dynamic";

/** GET: today's team idea is guaranteed, then the full ideas board. */
export async function GET() {
  try {
    ensureDailyIdea();
    return NextResponse.json({ ok: true, ideas: listIdeas(), stats: ideaStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ideas failed" },
      { status: 500 }
    );
  }
}

/** POST: submit an owner idea, or add a team recommendation. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "recommend") {
      const verdict = ["APPROVE", "CONDITIONAL", "REJECT"].includes(body.verdict)
        ? (body.verdict as Verdict)
        : null;
      if (!body.ideaId || !body.agentId || !verdict || !body.note) {
        return NextResponse.json({ ok: false, error: "يلزم ideaId و agentId و verdict و note" }, { status: 400 });
      }
      const idea = addRecommendation(String(body.ideaId), String(body.agentId), verdict, String(body.note));
      if (!idea) return NextResponse.json({ ok: false, error: "الفكرة أو الوكيل غير موجود" }, { status: 404 });
      return NextResponse.json({ ok: true, idea });
    }

    // default action: submit an owner idea
    const title = String(body.title || "").trim();
    const hypothesis = String(body.hypothesis || "").trim();
    const budgetSAR = Number(body.budgetSAR);
    const horizonDays = Number(body.horizonDays);

    if (!title || !hypothesis || !(budgetSAR > 0) || !(horizonDays > 0)) {
      return NextResponse.json(
        { ok: false, error: "يلزم عنوان وفرضية وميزانية وأفق زمني صالحان" },
        { status: 400 }
      );
    }

    const idea = submitIdea({ title, hypothesis, budgetSAR, horizonDays, source: "OWNER" });
    return NextResponse.json({ ok: true, idea, stats: ideaStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Idea submit failed" },
      { status: 500 }
    );
  }
}
