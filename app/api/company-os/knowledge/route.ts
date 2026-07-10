import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  linkKnowledgeNodes,
  queryKnowledgeNeighborhood,
  recordOutcomeLesson,
  upsertKnowledgeNode,
} from "@/lib/company-os/knowledgeService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  const externalId = new URL(req.url).searchParams.get("externalId")?.trim();
  if (!externalId) {
    return NextResponse.json({ ok: false, error: "externalId is required", requestId: auth.context.requestId }, { status: 400 });
  }
  try {
    const graph = await queryKnowledgeNeighborhood({ tenantId: auth.context.tenantId, externalId });
    return NextResponse.json({ ok: true, graph, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Knowledge query failed", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    if (body.kind === "node") {
      const node = await upsertKnowledgeNode({ ...body.node, tenantId: auth.context.tenantId });
      return NextResponse.json({ ok: true, node, requestId: auth.context.requestId }, { status: 201 });
    }
    if (body.kind === "edge") {
      const edge = await linkKnowledgeNodes({ ...body.edge, tenantId: auth.context.tenantId });
      return NextResponse.json({ ok: true, edge, requestId: auth.context.requestId }, { status: 201 });
    }
    if (body.kind === "lesson") {
      const lesson = await recordOutcomeLesson({ ...body.lesson, tenantId: auth.context.tenantId });
      return NextResponse.json({ ok: true, lesson, requestId: auth.context.requestId }, { status: 201 });
    }
    return NextResponse.json(
      { ok: false, error: "kind must be node, edge, or lesson", requestId: auth.context.requestId },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Knowledge write failed", requestId: auth.context.requestId },
      { status: 400 }
    );
  }
}
