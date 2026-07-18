import { NextRequest, NextResponse } from "next/server";
import {
  submitIdea,
  listIdeas,
  listApprovedIdeas,
  ideaStats,
  ensureDailyIdea,
  enrichIdea,
  addRecommendation,
  type Verdict,
} from "@/lib/company/ideas";
import { executeApprovedIdea } from "@/lib/company/ideaExecution";
import { authenticateRequest } from "@/lib/auth";
import { getLearningSnapshot } from "@/lib/company/learning";
import { hydrateCompany } from "@/lib/company/hydrate";

export const dynamic = "force-dynamic";

/** GET: today's team idea is guaranteed, then the full ideas board — each idea
 *  annotated against the company's adaptive confidence threshold (F6). */
export async function GET() {
  try {
    await hydrateCompany();
    const daily = ensureDailyIdea();
    await enrichIdea(daily.id);
    const threshold = getLearningSnapshot().confidenceThreshold;
    const ideas = listIdeas().map((i) => ({
      ...i,
      belowThreshold: i.aggregate ? i.aggregate.confidence < threshold : false,
    }));
    return NextResponse.json({
      ok: true,
      ideas,
      approvedIdeas: listApprovedIdeas(),
      stats: ideaStats(),
      confidenceThreshold: threshold,
    });
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
    await hydrateCompany();
    const body = await req.json().catch(() => ({}));

    // Manual conversion: the owner picks any APPROVED idea and converts it.
    // Guarded twice — only approved ideas convert, and conversion is
    // idempotent (an already-executed idea returns its existing project).
    if (body.action === "execute") {
      const ideaId = String(body.ideaId || "");
      const idea = listApprovedIdeas().find((item) => item.id === ideaId);
      if (!idea) {
        return NextResponse.json(
          { ok: false, error: "الفكرة غير موجودة ضمن الأفكار المعتمدة — الاعتماد أولاً من مركز القرار." },
          { status: 400 }
        );
      }
      const user = await authenticateRequest(req);
      const execution = await executeApprovedIdea({ ideaId }, user?.name || "المالك");
      return NextResponse.json({ ok: execution.ok, execution, approvedIdeas: listApprovedIdeas() });
    }

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
    await enrichIdea(idea.id);
    return NextResponse.json({ ok: true, idea, stats: ideaStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Idea submit failed" },
      { status: 500 }
    );
  }
}
