import { NextResponse } from "next/server";
import { getLearningSnapshot } from "@/lib/company/learning";

export const dynamic = "force-dynamic";

/** GET: the company's self-improvement snapshot (weekly review + adaptation). */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...getLearningSnapshot() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Learning failed" },
      { status: 500 }
    );
  }
}
