import { NextResponse } from "next/server";
import { getInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** GET: the unified decision inbox (all channels, pending first). */
export async function GET() {
  try {
    const inbox = await getInbox();
    return NextResponse.json({ ok: true, ...inbox });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Inbox failed" },
      { status: 500 }
    );
  }
}
