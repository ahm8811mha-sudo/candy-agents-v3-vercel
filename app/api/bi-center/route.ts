import { generateOperationalAlerts } from "@/lib/alertEngine";
import { getUnifiedBICenter } from "@/lib/biCenter";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getUnifiedBICenter();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "BI center failed" }, { status: 500 });
  }
}

export async function POST() {
  try {
    await generateOperationalAlerts();
    const data = await getUnifiedBICenter();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "BI refresh failed" }, { status: 500 });
  }
}
