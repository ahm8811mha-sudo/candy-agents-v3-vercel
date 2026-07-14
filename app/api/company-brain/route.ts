import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  buildCompanySnapshot,
  createAutonomousPlan,
  createExecutiveNarrative,
  generateRecommendations,
  linkKnowledgeNodes,
  persistPlan,
  persistRecommendations,
  persistSimulation,
  persistSnapshot,
  recordLearningEvent,
  runSimulation,
  upsertKnowledgeNode,
} from "@/lib/company-intelligence/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const simulationSchema = z.object({
  action: z.literal("simulate"),
  name: z.string().min(3).max(160),
  scenarioType: z.string().min(2).max(80),
  baseline: z.object({
    monthlyRevenue: z.number().finite(),
    monthlyPayroll: z.number().finite().nonnegative(),
    monthlyOperatingExpenses: z.number().finite().nonnegative(),
    cashBalance: z.number().finite().optional(),
  }),
  assumptions: z.object({
    revenueGrowthPct: z.number().finite().min(-100).max(1000).optional(),
    salaryChangePct: z.number().finite().min(-100).max(1000).optional(),
    operatingExpenseChangePct: z.number().finite().min(-100).max(1000).optional(),
    fxImpactPct: z.number().finite().min(-100).max(1000).optional(),
    fixedInvestment: z.number().finite().nonnegative().optional(),
    addedMonthlyRevenue: z.number().finite().optional(),
    horizonMonths: z.number().int().min(1).max(60).optional(),
  }),
});

const planSchema = z.object({
  action: z.literal("plan"),
  goal: z.string().min(5).max(1000),
  goalType: z.string().min(2).max(80).optional(),
  horizonDays: z.number().int().min(14).max(365).optional(),
  budgetLimit: z.number().finite().positive().optional(),
  owner: z.string().min(2).max(160).optional(),
  assumptions: z.record(z.unknown()).optional(),
});

const learningSchema = z.object({
  action: z.literal("learn"),
  subjectType: z.string().min(2).max(80),
  subjectId: z.string().min(1).max(240),
  eventType: z.string().min(2).max(80),
  expected: z.record(z.unknown()).optional(),
  actual: z.record(z.unknown()).optional(),
  outcomeScore: z.number().finite().min(-100).max(100).optional(),
  lessons: z.array(z.string().min(2).max(500)).max(50).optional(),
  featureUpdates: z.record(z.unknown()).optional(),
});

const nodeSchema = z.object({
  action: z.literal("upsert_node"),
  entityType: z.string().min(2).max(80),
  entityId: z.string().min(1).max(240),
  title: z.string().min(2).max(300),
  summary: z.string().max(3000).optional(),
  attributes: z.record(z.unknown()).optional(),
  source: z.string().min(2).max(80).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const edgeSchema = z.object({
  action: z.literal("link_nodes"),
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  relationType: z.string().min(2).max(80),
  strength: z.number().min(0).max(1).optional(),
  evidence: z.array(z.unknown()).max(100).optional(),
  source: z.string().min(2).max(80).optional(),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  simulationSchema,
  planSchema,
  learningSchema,
  nodeSchema,
  edgeSchema,
]);

function normalizeRequestBody(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return body;
  return { ...(body.data as Record<string, unknown>), action: body.action };
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  try {
    const snapshot = await buildCompanySnapshot(auth.context.tenantId);
    const recommendations = generateRecommendations(snapshot);
    const narrative = createExecutiveNarrative(snapshot, recommendations);

    return NextResponse.json({
      ok: true,
      snapshot,
      recommendations,
      narrative,
      requestId: auth.context.requestId,
      correlationId: auth.context.correlationId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "تعذر بناء ذكاء الشركة.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  const rawBody = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(normalizeRequestBody(rawBody));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "بيانات الطلب غير صحيحة.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const input = parsed.data;

    if (input.action === "refresh") {
      const snapshot = await buildCompanySnapshot(auth.context.tenantId);
      const recommendations = generateRecommendations(snapshot);
      const narrative = createExecutiveNarrative(snapshot, recommendations);
      const snapshotId = await persistSnapshot(snapshot);
      const recommendationIds = await persistRecommendations(auth.context.tenantId, recommendations);
      return NextResponse.json({ ok: true, snapshotId, recommendationIds, snapshot, recommendations, narrative });
    }

    if (input.action === "simulate") {
      const result = runSimulation(input);
      const simulationId = await persistSimulation(auth.context.tenantId, auth.context.actor.id, input, result);
      return NextResponse.json({ ok: true, simulationId, result });
    }

    if (input.action === "plan") {
      const plan = createAutonomousPlan(input);
      const planId = await persistPlan(auth.context.tenantId, auth.context.actor.id, input, plan);
      return NextResponse.json({ ok: true, planId, plan, status: "AWAITING_APPROVAL" });
    }

    if (input.action === "learn") {
      const learningEventId = await recordLearningEvent(auth.context.tenantId, input);
      return NextResponse.json({ ok: true, learningEventId });
    }

    if (input.action === "upsert_node") {
      const nodeId = await upsertKnowledgeNode({ tenantId: auth.context.tenantId, ...input });
      return NextResponse.json({ ok: true, nodeId });
    }

    const edgeId = await linkKnowledgeNodes({ tenantId: auth.context.tenantId, ...input });
    return NextResponse.json({ ok: true, edgeId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "تعذر تنفيذ عملية ذكاء الشركة.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}
