import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addProjectStep, projectStepsReport, updateStepRouting } from "@/lib/company/projectSteps";
import { isBridgeAgent } from "@/lib/company/agentBridge";
import { notifyAgent, openProjectSpendStep, recordRelayedOwnerRejection, runProjectSweep } from "@/lib/company/projectStepsBridge";
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
  /** Backfill: link every opportunity-radar spend request to its own project (idempotent). */
  z.object({ action: z.literal("link_radar_projects") }),
  z.object({
    action: z.literal("owner_relayed_reject"),
    approvalId: z.string().trim().min(3).max(120),
    ownerWords: z.string().trim().min(3).max(600),
    relayedBy: z.string().trim().min(2).max(80),
    note: z.string().trim().max(600).optional(),
  }),
  z.object({
    action: z.literal("update_step"),
    taskId: z.string().trim().min(3).max(160),
    agentId: z.string().trim().min(3).max(40).optional(),
    executionKind: z.enum(["INTERNAL", "REAL_WORLD"]).optional(),
    dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  /** Add a no-spend step owned by one employee (idempotent by title within the project). */
  z.object({
    action: z.literal("add_step"),
    projectId: z.string().trim().min(3).max(120),
    title: z.string().trim().min(3).max(200),
    agentId: z.string().trim().min(3).max(40),
    dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    description: z.string().trim().max(4000).optional(),
    executionKind: z.enum(["INTERNAL", "REAL_WORLD"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    source: z.string().trim().max(120).optional(),
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
    if (body.action === "owner_relayed_reject") {
      await hydrateCompany();
      return NextResponse.json({ ok: true, result: await recordRelayedOwnerRejection(body) });
    }
    if (body.action === "link_radar_projects") {
      await hydrateCompany();
      const { listApprovals } = await import("@/lib/approvals");
      const { linkRadarRequestsToProjects } = await import("@/lib/company/radarProject");
      return NextResponse.json({ ok: true, result: await linkRadarRequestsToProjects(listApprovals(undefined, { includeArchived: true }) as never) });
    }
    if (body.action === "update_step") {
      if (body.agentId && !isBridgeAgent(body.agentId)) throw new Error("موظف غير معروف.");
      return NextResponse.json({ ok: true, result: await updateStepRouting({ ...body, actor: "bridge-master" }) });
    }
    if (body.action === "add_step") {
      if (!isBridgeAgent(body.agentId)) throw new Error("موظف غير معروف.");
      const result = await addProjectStep({ ...body, actor: "bridge-master" });
      if (result.created) {
        await notifyAgent(body.agentId, `خطوة جديدة لك في المشروع: «${body.title}»${body.dueDate ? ` — الموعد ${body.dueDate}` : ""}. سلّم مخرجك عبر /api/bridge/agents/${body.agentId}/steps (action: deliver).`).catch(() => undefined);
      }
      return NextResponse.json({ ok: true, result });
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
