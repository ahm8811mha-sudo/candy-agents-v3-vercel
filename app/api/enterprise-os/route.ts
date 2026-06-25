import { getEnterpriseStatus, runOpportunityRadar, seedEnterpriseOperatingSystem } from "@/lib/enterpriseSystems";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getEnterpriseStatus();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Enterprise OS failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "seed");

    if (action === "radar") {
      const result = await runOpportunityRadar("MANUAL");
      return NextResponse.json({ ok: true, result });
    }

    const data = await seedEnterpriseOperatingSystem();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Enterprise OS action failed" },
      { status: 500 }
    );
  }
}
