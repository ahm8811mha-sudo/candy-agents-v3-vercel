import { evaluateGovernedAction, getGovernanceCenter, seedGovernanceOS } from "@/lib/governanceOS";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getGovernanceCenter();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Governance center failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "seed");

    if (action === "evaluate") {
      const result = await evaluateGovernedAction(body.data);
      return NextResponse.json({ ok: true, result });
    }

    await seedGovernanceOS();
    const data = await getGovernanceCenter();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Governance action failed" },
      { status: 500 }
    );
  }
}
