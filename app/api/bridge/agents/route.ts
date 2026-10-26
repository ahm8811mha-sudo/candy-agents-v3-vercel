import { NextRequest, NextResponse } from "next/server";
import { bridgeRoster } from "@/lib/company/agentBridge";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";

function bridgeAccess(req: NextRequest) {
  return authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
}

export async function GET(req: NextRequest) {
  const access = bridgeAccess(req);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  return NextResponse.json({
    ok: true,
    agents: bridgeRoster(access.scope === "agent" ? access.agentId : undefined),
  });
}
