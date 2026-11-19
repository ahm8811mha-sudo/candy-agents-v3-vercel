import { NextRequest, NextResponse } from "next/server";
import { hydrateChairmanCommands, listAutoClosedCommands, listOpenCommandsSince } from "@/lib/company/chairmanCommands";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";

/** Cheap poll of open chairman commands. GET never writes, spends, or sends. */
export async function GET(req: NextRequest) {
  const access = authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
  if (!access.ok || access.scope !== "master") {
    const status = access.ok ? 403 : access.status;
    const error = access.ok ? "هذا المسار لمفتاح الجسر الرئيسي فقط." : access.error;
    return NextResponse.json({ ok: false, error }, { status });
  }
  if (req.nextUrl.searchParams.get("audit") === "auto-closed") {
    await hydrateChairmanCommands();
    return NextResponse.json({ ok: true, commands: listAutoClosedCommands() });
  }
  const since = req.nextUrl.searchParams.get("since") || "";
  if (!Number.isFinite(Date.parse(since))) {
    return NextResponse.json({ ok: false, error: "since يجب أن يكون تاريخاً بصيغة ISO." }, { status: 400 });
  }
  // Default stays open-only. status=all|closed|open (or includeClosed=1 for all)
  // lists commands updated or closed at or after since.
  const params = req.nextUrl.searchParams;
  const rawStatus = params.get("status");
  const includeClosedFlag = ["1", "true"].includes(params.get("includeClosed") || "");
  let status: "open" | "closed" | "all";
  if (!rawStatus) status = includeClosedFlag ? "all" : "open";
  else if (rawStatus === "open" || rawStatus === "closed" || rawStatus === "all") status = rawStatus;
  else return NextResponse.json({ ok: false, error: "status يجب أن يكون open أو closed أو all." }, { status: 400 });
  await hydrateChairmanCommands();
  return NextResponse.json({
    ok: true,
    since,
    ...(rawStatus || includeClosedFlag ? { status } : {}),
    commands: listOpenCommandsSince(since, { status }),
  });
}
