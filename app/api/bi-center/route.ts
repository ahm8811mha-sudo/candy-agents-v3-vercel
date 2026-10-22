import { generateOperationalAlerts } from "@/lib/alertEngine";
import { getUnifiedBICenter } from "@/lib/biCenter";
import { NextResponse } from "next/server";
import { failureStatus } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getUnifiedBICenter();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر تحميل ذكاء الأعمال." }, { status: failureStatus(error) });
  }
}

export async function POST() {
  try {
    await generateOperationalAlerts();
    const data = await getUnifiedBICenter();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر تحديث ذكاء الأعمال." }, { status: failureStatus(error) });
  }
}
