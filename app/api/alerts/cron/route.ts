import { generateOperationalAlerts } from "@/lib/alertEngine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await generateOperationalAlerts();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Alert cron failed" },
      { status: 500 }
    );
  }
}
