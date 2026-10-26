import { NextRequest, NextResponse } from "next/server";
import { agentWorkspace } from "@/lib/company/agentBridge";
import { hydrateChairmanCommands } from "@/lib/company/chairmanCommands";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";

async function authorize(req: NextRequest, agentKey: string) {
  const access = authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
  if (!access.ok) return { response: NextResponse.json({ ok: false, error: access.error }, { status: access.status }) };
  if (access.scope === "agent" && access.agentId !== agentKey) {
    return { response: NextResponse.json({ ok: false, error: "المفتاح لا يغطي هذا الموظف." }, { status: 403 }) };
  }
  return { response: null };
}

export async function GET(req: NextRequest, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  const gate = await authorize(req, agentKey);
  if (gate.response) return gate.response;
  try {
    await hydrateChairmanCommands();
    const workspace = await agentWorkspace(agentKey);
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر فتح مساحة الموظف." }, { status: 400 });
  }
}
