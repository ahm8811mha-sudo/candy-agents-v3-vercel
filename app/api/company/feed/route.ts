import { NextResponse } from "next/server";
import { getFeedCursor } from "@/lib/company/feed";
import { hydrateCompany } from "@/lib/company/hydrate";

export const dynamic = "force-dynamic";

/** GET: ~100-byte change cursor — poll cheaply, refetch only on change. */
export async function GET() {
  try {
    await hydrateCompany();
    return NextResponse.json({ ok: true, ...getFeedCursor() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Feed failed" },
      { status: 500 }
    );
  }
}
