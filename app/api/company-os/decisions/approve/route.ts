import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireCompanyContext } from "@/lib/company-os/context";
import { actorExecutiveRole, enforceCompanyPolicy } from "@/lib/company-os/policy";
import { createCompanyEvent } from "@/lib/company-os/events";
import { appendCompanyEvent } from "@/lib/company-os/outboxPublisher";
import { advanceWorkflowUntilBlocked } from "@/lib/company-os/runtimeRunner";
import type { ExecutiveRole, RiskLevel } from "@/lib/company-os/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is required", requestId: auth.context.requestId }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const decisionId = String(body.decisionId || "").trim();
    const vote = String(body.vote || "").toUpperCase();
    if (!decisionId || !["APPROVED", "REJECTED"].includes(vote)) {
      return NextResponse.json(
        { ok: false, error: "decisionId and vote=APPROVED|REJECTED are required", requestId: auth.context.requestId },
        { status: 400 }
      );
    }

    const executiveRole = actorExecutiveRole(auth.context.actor);
    if (!executiveRole) {
      return NextResponse.json(
        { ok: false, error: "Only an authorized executive can vote on a decision.", requestId: auth.context.requestId },
        { status: 403 }
      );
    }

    const { data: decision, error: decisionError } = await supabase
      .from("decision_packets")
      .select("*")
      .eq("tenant_id", auth.context.tenantId)
      .eq("id", decisionId)
      .maybeSingle();
    if (decisionError) throw decisionError;
    if (!decision) {
      return NextResponse.json({ ok: false, error: "Decision not found in this tenant", requestId: auth.context.requestId }, { status: 404 });
    }

    const required = Array.isArray(decision.required_approvals) ? decision.required_approvals as ExecutiveRole[] : [];
    if (!required.includes(executiveRole)) {
      return NextResponse.json(
        { ok: false, error: `Role ${executiveRole} is not part of this decision's approval route.`, requestId: auth.context.requestId },
        { status: 403 }
      );
    }

    const { data: priorVotes, error: votesError } = await supabase
      .from("decision_approvals")
      .select("required_role,status")
      .eq("tenant_id", auth.context.tenantId)
      .eq("decision_id", decisionId);
    if (votesError) throw votesError;
    const approvedRoles = (priorVotes || [])
      .filter((item) => item.status === "APPROVED")
      .map((item) => item.required_role as ExecutiveRole);

    const policy = await enforceCompanyPolicy(
      {
        tenantId: auth.context.tenantId,
        actor: auth.context.actor,
        operation: "CAST_APPROVAL",
        proposerId: decision.created_by || undefined,
        evidenceCount: Array.isArray(decision.facts) ? decision.facts.length : 0,
        commitmentSAR: Number(decision.financial_impact_sar || 0),
        approvedRoles,
        regulatoryAction: decision.risk_level === "CRITICAL",
        sensitiveData: decision.risk_level === "HIGH",
      },
      { type: "decision_packet", id: decisionId }
    );

    const now = new Date().toISOString();
    const { error: voteError } = await supabase
      .from("decision_approvals")
      .update({
        status: vote,
        approver_id: auth.context.actor.id,
        note: body.note ? String(body.note) : null,
        decided_at: now,
      })
      .eq("tenant_id", auth.context.tenantId)
      .eq("decision_id", decisionId)
      .eq("required_role", executiveRole);
    if (voteError) throw voteError;

    const { data: allVotes, error: allVotesError } = await supabase
      .from("decision_approvals")
      .select("required_role,status")
      .eq("tenant_id", auth.context.tenantId)
      .eq("decision_id", decisionId);
    if (allVotesError) throw allVotesError;

    const rejected = (allVotes || []).some((item) => item.status === "REJECTED");
    const approvedSet = new Set((allVotes || []).filter((item) => item.status === "APPROVED").map((item) => item.required_role));
    const quorum = required.every((role) => approvedSet.has(role));
    const decisionStatus = rejected ? "REJECTED" : quorum ? "APPROVED" : "PENDING_APPROVAL";

    const { error: updateError } = await supabase
      .from("decision_packets")
      .update({ status: decisionStatus, updated_at: now })
      .eq("tenant_id", auth.context.tenantId)
      .eq("id", decisionId);
    if (updateError) throw updateError;

    if (decision.workflow_instance_id) {
      if (rejected) {
        await supabase
          .from("workflow_instances")
          .update({ status: "CANCELLED", error: { code: "DECISION_REJECTED", decisionId }, updated_at: now })
          .eq("tenant_id", auth.context.tenantId)
          .eq("id", decision.workflow_instance_id);
      } else if (quorum) {
        await supabase
          .from("workflow_steps")
          .update({ available_at: now, updated_at: now })
          .eq("tenant_id", auth.context.tenantId)
          .eq("workflow_instance_id", decision.workflow_instance_id)
          .eq("step_key", "WAIT_FOR_APPROVAL");

        await supabase
          .from("workflow_instances")
          .update({ status: "PENDING", next_wake_at: now, updated_at: now })
          .eq("tenant_id", auth.context.tenantId)
          .eq("id", decision.workflow_instance_id);
      }
    }

    const event = createCompanyEvent({
      type: "decision.vote_recorded",
      tenantId: auth.context.tenantId,
      actorId: auth.context.actor.id,
      actorType: "HUMAN",
      entityType: "decision",
      entityId: decisionId,
      correlationId: auth.context.correlationId,
      payload: {
        vote,
        executiveRole,
        decisionStatus,
        quorum,
        riskLevel: decision.risk_level as RiskLevel,
      },
    });
    await appendCompanyEvent(event);

    let workflowProgress: unknown = null;
    if (quorum && decision.workflow_instance_id) {
      try {
        workflowProgress = await advanceWorkflowUntilBlocked({
          tenantId: auth.context.tenantId,
          workflowInstanceId: String(decision.workflow_instance_id),
          maxCycles: 10,
          batchLimit: 50,
        });
      } catch (progressError) {
        workflowProgress = {
          settled: false,
          error: progressError instanceof Error ? progressError.message : "Workflow resume failed",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      decisionId,
      vote,
      executiveRole,
      decisionStatus,
      quorum,
      policy,
      approvals: allVotes || [],
      workflowProgress,
      requestId: auth.context.requestId,
    });
  } catch (error) {
    const typed = error as Error & { code?: string; decision?: unknown };
    return NextResponse.json(
      { ok: false, code: typed.code, policy: typed.decision, error: typed.message || "Decision vote failed", requestId: auth.context.requestId },
      { status: typed.code === "POLICY_DENIED" ? 403 : 500 }
    );
  }
}
