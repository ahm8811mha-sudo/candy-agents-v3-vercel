import { NextRequest, NextResponse } from "next/server";
import { postBridgeAction } from "@/lib/company/agentBridge";
import { hydrateChairmanCommands } from "@/lib/company/chairmanCommands";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  const access = authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  if (access.scope === "agent" && access.agentId !== agentKey) {
    return NextResponse.json({ ok: false, error: "المفتاح لا يغطي هذا الموظف." }, { status: 403 });
  }
  try {
    await hydrateChairmanCommands();
    const body = await req.json().catch(() => ({}));
    const result = await postBridgeAction(agentKey, body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر تنفيذ الإجراء." }, { status: 400 });
  }
}
