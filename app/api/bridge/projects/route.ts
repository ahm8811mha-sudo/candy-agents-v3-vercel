import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { projectStepsReport, updateStepRouting } from "@/lib/company/projectSteps";
import { isBridgeAgent } from "@/lib/company/agentBridge";
import { openProjectSpendStep, runProjectSweep } from "@/lib/company/projectStepsBridge";
import { hydrateCompany } from "@/lib/company/hydrate";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function gate(req: NextRequest) {
  const access = authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  return null;
}

/** Master key: every project with its steps, what is stuck and what is late. */
export async function GET(req: NextRequest) {
  const denied = gate(req);
  if (denied) return denied;
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
    const includeOutputs = req.nextUrl.searchParams.get("outputs") === "1";
    return NextResponse.json({ ok: true, ...(await projectStepsReport(undefined, { projectId, includeOutputs })) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر قراءة المشاريع." }, { status: 500 });
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sweep"), projectId: z.string().trim().min(3).max(120).optional() }),
  z.object({ action: z.literal("reactivate"), projectId: z.string().trim().min(3).max(120) }),
  z.object({
    action: z.literal("update_step"),
    taskId: z.string().trim().min(3).max(160),
    agentId: z.string().trim().min(3).max(40).optional(),
    executionKind: z.enum(["INTERNAL", "REAL_WORLD"]).optional(),
  }),
  z.object({
    action: z.literal("spend_step"),
    projectId: z.string().trim().min(3).max(120),
    title: z.string().trim().min(5).max(200),
    detail: z.string().trim().min(20).max(4000),
    amountSAR: z.number().finite().positive().max(1_000_000),
    preparingAgentId: z.string().trim().min(3).max(40),
    dueDate: z.string().trim().max(40).optional(),
  }),
]);

/** Master key: run the step sweep, reactivate a project, or open its one spend step. */
export async function POST(req: NextRequest) {
  const denied = gate(req);
  if (denied) return denied;
  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    if (body.action === "update_step") {
      if (body.agentId && !isBridgeAgent(body.agentId)) throw new Error("موظف غير معروف.");
      return NextResponse.json({ ok: true, result: await updateStepRouting({ ...body, actor: "bridge-master" }) });
    }
    if (body.action === "spend_step") {
      await hydrateCompany();
      return NextResponse.json({ ok: true, result: await openProjectSpendStep(body) });
    }
    const result = await runProjectSweep({ projectId: body.projectId, reactivate: body.action === "reactivate", actor: "bridge-master" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر تنفيذ الإجراء." }, { status: 400 });
  }
}
