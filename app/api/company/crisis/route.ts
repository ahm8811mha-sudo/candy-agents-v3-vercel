import { NextRequest, NextResponse } from "next/server";
import { createCrisis, listCrises, crisisStats, hydrateCrises } from "@/lib/company/crisis";
import { hydrateApprovals } from "@/lib/approvals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await Promise.all([hydrateApprovals(), hydrateCrises()]);
    return NextResponse.json({ ok: true, crises: listCrises(), stats: crisisStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Recovery center failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await Promise.all([hydrateApprovals(), hydrateCrises()]);
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const amountSAR = Number(body.amountSAR);
    const days = Number(body.days || 30);

    if (!title || !(amountSAR > 0) || !(days > 0)) {
      return NextResponse.json(
        { ok: false, error: "يلزم عنوان ومبلغ ومدة صالحة" },
        { status: 400 }
      );
    }

    const item = createCrisis({
      title,
      description,
      amountSAR,
      days,
      severity: body.severity,
      owner: "owner",
    });

    return NextResponse.json({ ok: true, crisis: item, crises: listCrises(), stats: crisisStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Recovery submit failed" },
      { status: 500 }
    );
  }
}
