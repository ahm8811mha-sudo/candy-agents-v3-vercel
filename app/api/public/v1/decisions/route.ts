import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/publicApi";
import { getInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/decisions — the decision queue with SLA telemetry.
 *  Read-only by design: sign-off happens only in the decision center under
 *  the authority matrix, never through the public API. */
export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const inbox = await getInbox();
  return NextResponse.json({
    ok: true,
    pending: inbox.pending,
    stale: inbox.stale,
    oldestPendingHours: inbox.oldestPendingHours,
    items: inbox.items.filter((i) => i.status === "PENDING"),
  });
}
