import { NextResponse } from "next/server";
import { dispatchDigest } from "@/lib/company/digest";

export const dynamic = "force-dynamic";

/** Daily cron: send the owner their morning brief. */
export async function GET() {
  try {
    const { dispatch } = await dispatchDigest();
    return NextResponse.json({ ok: true, dispatch });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Digest cron failed" },
      { status: 500 }
    );
  }
}
