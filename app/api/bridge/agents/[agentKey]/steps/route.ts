import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBridgeAgent } from "@/lib/company/agentBridge";
import { deliverStep, stepsForAgent } from "@/lib/company/projectSteps";
import { appendWorkEvent } from "@/lib/company/workEvents";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";

function authorize(req: NextRequest, agentKey: string) {
  const access = authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
  if (!access.ok) return { error: NextResponse.json({ ok: false, error: access.error }, { status: access.status }), master: false };
  if (access.scope === "agent" && access.agentId !== agentKey) {
    return { error: NextResponse.json({ ok: false, error: "المفتاح لا يغطي هذا الموظف." }, { status: 403 }), master: false };
  }
  if (!isBridgeAgent(agentKey)) return { error: NextResponse.json({ ok: false, error: "موظف غير معروف." }, { status: 404 }), master: false };
  return { error: null, master: access.scope === "master" };
}

/** The project steps this employee owns and can work on now. */
export async function GET(req: NextRequest, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  const gate = authorize(req, agentKey);
  if (gate.error) return gate.error;
  try {
    return NextResponse.json({ ok: true, agentId: agentKey, steps: await stepsForAgent(agentKey) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر قراءة الخطوات." }, { status: 500 });
  }
}

const deliverSchema = z.object({
  action: z.enum(["deliver", "progress"]).default("deliver"),
  taskId: z.string().trim().min(3).max(160),
  output: z.string().trim().min(40).max(60_000),
  sources: z.array(z.string().trim().max(500)).max(40).optional(),
});

/** Hand in a step's deliverable (or a progress draft). */
export async function POST(req: NextRequest, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  const gate = authorize(req, agentKey);
  if (gate.error) return gate.error;
  try {
    const body = deliverSchema.parse(await req.json().catch(() => ({})));
    const result = await deliverStep(agentKey, { taskId: body.taskId, output: body.output, sources: body.sources, master: gate.master, progressOnly: body.action === "progress" });
    await appendWorkEvent({ entityType: "task", entityId: body.taskId, actor: agentKey, action: body.action === "progress" ? "step_progress" : "step_deliver", fromState: null, toState: result.status, note: `${result.title}: ${body.output.slice(0, 280)}`, evidence: (body.sources || []).slice(0, 5).join("\n") || null }).catch(() => undefined);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر تسليم الخطوة." }, { status: 400 });
  }
}
