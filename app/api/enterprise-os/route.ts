import { getEnterpriseStatus, runOpportunityRadar, seedEnterpriseOperatingSystem } from "@/lib/enterpriseSystems";
import { NextResponse } from "next/server";
import { failureStatus } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getEnterpriseStatus();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "تعذر تحميل نظام المؤسسة." },
      { status: failureStatus(error) }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "seed");

    if (action === "radar") {
      const result = await runOpportunityRadar("MANUAL", String(body.request || ""));
      return NextResponse.json({ ok: true, result });
    }

    const data = await seedEnterpriseOperatingSystem();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "تعذر تنفيذ إجراء نظام المؤسسة." },
      { status: failureStatus(error) }
    );
  }
}
