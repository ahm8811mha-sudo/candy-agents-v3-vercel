import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/publicApi";
import { hydrateCompany } from "@/lib/company/hydrate";
import { listIdeas, submitIdea, ideaStats } from "@/lib/company/ideas";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/ideas — the ideas board (governed pipeline included). */
export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  await hydrateCompany();
  return NextResponse.json({ ok: true, ideas: listIdeas(), stats: ideaStats() });
}

/** POST /api/public/v1/ideas — submit an idea into the governed pipeline.
 *  It is studied by the agents and gated to the decision center like any
 *  other idea; the API can never bypass the authority matrix. */
export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  await hydrateCompany();
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const hypothesis = String(body.hypothesis || "").trim();
  const budgetSAR = Number(body.budgetSAR);
  const horizonDays = Number(body.horizonDays);

  if (!title || !hypothesis || !(budgetSAR > 0) || !(horizonDays > 0)) {
    return NextResponse.json(
      { ok: false, error: "title, hypothesis, budgetSAR (>0) and horizonDays (>0) are required." },
      { status: 400 }
    );
  }

  const idea = submitIdea({ title, hypothesis, budgetSAR, horizonDays, source: "OWNER" });
  return NextResponse.json({ ok: true, idea, stats: ideaStats() }, { status: 201 });
}
