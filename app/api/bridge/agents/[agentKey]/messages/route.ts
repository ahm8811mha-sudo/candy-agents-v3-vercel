import { isDurableWriteError } from "@/lib/company/agentBridge";
import { NextRequest, NextResponse } from "next/server";
import { listBridgeMessages, postBridgeMessage } from "@/lib/company/agentBridge";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";

function gate(req: NextRequest, agentKey: string) {
  const access = authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  if (access.scope === "agent" && access.agentId !== agentKey) {
    return NextResponse.json({ ok: false, error: "المفتاح لا يغطي هذا الموظف." }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  const denied = gate(req, agentKey);
  if (denied) return denied;
  return NextResponse.json({ ok: true, messages: listBridgeMessages(agentKey) });
}

export async function POST(req: NextRequest, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  const denied = gate(req, agentKey);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const message = await postBridgeMessage(agentKey, body);
    return NextResponse.json({ ok: true, message });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر حفظ الرسالة." }, { status: isDurableWriteError(error) ? 500 : 400 });
  }
}
