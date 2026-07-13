import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyContext } from "@/lib/company-os/context";
import { installBuiltinSkills } from "@/lib/company-intelligence/platform";
import {
  executeSkillRun,
  listInstalledSkills,
  requestSkillRun,
} from "@/lib/company-intelligence/skillRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  action: z.enum(["install", "request", "approve", "execute"]),
  slug: z.string().min(2).max(120).optional(),
  version: z.string().min(1).max(40).optional(),
  idempotencyKey: z.string().min(8).max(240).optional(),
  runId: z.string().uuid().optional(),
  input: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  try {
    const skills = await listInstalledSkills(auth.context.tenantId);
    return NextResponse.json({
      ok: true,
      tenantId: auth.context.tenantId,
      skills,
      requestId: auth.context.requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Skills registry failed.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  try {
    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid skill request.", issues: parsed.error.flatten(), requestId: auth.context.requestId },
        { status: 400 }
      );
    }

    const body = parsed.data;
    if (body.action === "install") {
      const installationIds = await installBuiltinSkills(auth.context.tenantId, auth.context.actor.id);
      const skills = await listInstalledSkills(auth.context.tenantId);
      return NextResponse.json({ ok: true, installationIds, skills, requestId: auth.context.requestId });
    }

    if (body.action === "request") {
      if (!body.slug || !body.idempotencyKey) {
        return NextResponse.json(
          { ok: false, error: "slug and idempotencyKey are required.", requestId: auth.context.requestId },
          { status: 400 }
        );
      }
      const run = await requestSkillRun({
        tenantId: auth.context.tenantId,
        slug: body.slug,
        version: body.version,
        idempotencyKey: body.idempotencyKey,
        input: body.input,
        actorId: auth.context.actor.id,
      });
      return NextResponse.json({ ok: true, run, requestId: auth.context.requestId }, { status: 201 });
    }

    if (!body.runId) {
      return NextResponse.json(
        { ok: false, error: "runId is required.", requestId: auth.context.requestId },
        { status: 400 }
      );
    }

    const run = await executeSkillRun({
      tenantId: auth.context.tenantId,
      runId: body.runId,
      actorId: auth.context.actor.id,
      approve: body.action === "approve",
    });
    return NextResponse.json({ ok: true, run, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Skill execution failed.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}
