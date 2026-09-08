import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitIdeaCritical, readIdeasCritical, ideaStats, generateDailyIdeaCritical, enrichIdea, addRecommendationCritical, updateIdeaStudyCritical } from "@/lib/company/ideas";
import { ideaStudySchema } from "@/lib/company/ideaAssessment";
import { executeApprovedIdea } from "@/lib/company/ideaExecution";
import { requireCompanyContext } from "@/lib/company-os/context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const id = z.string().min(1).max(180);
const budget = z.number().finite().min(0).max(1e9);
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), title: z.string().trim().min(3).max(160), hypothesis: z.string().trim().min(10).max(5000), budgetSAR: budget, horizonDays: z.number().int().min(1).max(3650), study: ideaStudySchema.optional() }),
  z.object({ action: z.literal("study"), ideaId: id, revision: z.number().int().nonnegative(), study: ideaStudySchema, budgetSAR: budget.optional() }),
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("analyze"), ideaId: id }),
  z.object({ action: z.literal("execute"), ideaId: id }),
  z.object({ action: z.literal("recommend"), ideaId: id, agentId: z.string().min(1).max(80), verdict: z.enum(["APPROVE", "CONDITIONAL", "REJECT"]), note: z.string().trim().min(10).max(3000) }),
]);
function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر إتمام العملية؛ لم يؤكد النظام حفظ التغيير." }, { status: 503 });
}

/** Reads never generate, analyze, or write ideas. */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  try {
    const ideas = await readIdeasCritical(auth.context.tenantId);
    return NextResponse.json({ ok: true, ideas, approvedIdeas: ideas.filter((i) => i.status === "APPROVED").map((i) => ({ ...i, executed: Boolean(i.executedProjectId) })), stats: ideaStats(ideas) });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  const raw = await req.json().catch(() => null);
  const parsed = command.safeParse(raw && { ...raw, action: raw.action || "submit" });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "تحقق من الحقول المطلوبة وحدود الأرقام.", fields: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const { tenantId, actor } = auth.context;
  try {
    if (body.action === "generate") return NextResponse.json({ ok: true, ...await generateDailyIdeaCritical(tenantId, actor.name) });
    if (body.action === "execute") {
      const execution = await executeApprovedIdea({ ideaId: body.ideaId }, actor.name, tenantId);
      return NextResponse.json({ ok: execution.ok, execution, error: execution.ok ? undefined : execution.reason }, { status: execution.ok ? 200 : 409 });
    }
    const idea = body.action === "submit" ? await submitIdeaCritical({ ...body, source: "OWNER" }, tenantId, actor.name)
      : body.action === "study" ? await updateIdeaStudyCritical(body.ideaId, body.study, tenantId, actor.name, body.budgetSAR, body.revision)
        : body.action === "analyze" ? await enrichIdea(body.ideaId, tenantId, actor.name)
          : await addRecommendationCritical(body.ideaId, body.agentId, body.verdict, body.note, tenantId, actor.name);
    if (!idea) return NextResponse.json({ ok: false, error: "الفكرة غير موجودة." }, { status: 404 });
    return NextResponse.json({ ok: true, idea });
  } catch (error) { return failure(error); }
}
