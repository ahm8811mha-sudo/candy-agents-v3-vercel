import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runCompanyBrainCycle } from "@/lib/company-intelligence/platform";
import { listInstalledSkills } from "@/lib/company-intelligence/skillRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for Company Brain.");
  return supabase;
}

async function latestPlatformState(tenantId: string) {
  const supabase = requireSupabase();
  const [twin, snapshot, predictions, recommendations, narrative, ingestion, skills, facts] = await Promise.all([
    supabase
      .from("company_twin_states")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_type", "COMPANY")
      .eq("scope_id", "root")
      .maybeSingle(),
    supabase
      .from("company_intelligence_snapshots")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("company_prediction_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("decision_recommendations")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("status", ["PROPOSED", "ACCEPTED"])
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("executive_narratives")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("company_ingestion_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    listInstalledSkills(tenantId),
    supabase
      .from("company_fact_daily")
      .select("fact_date,domain,metric_key,numeric_value,text_value,json_value,unit,source,quality_score")
      .eq("tenant_id", tenantId)
      .order("fact_date", { ascending: false })
      .limit(100),
  ]);

  for (const result of [twin, snapshot, predictions, recommendations, narrative, ingestion, facts]) {
    if (result.error) throw result.error;
  }

  return {
    twin: twin.data,
    snapshot: snapshot.data,
    predictions: predictions.data || [],
    recommendations: recommendations.data || [],
    narrative: narrative.data,
    ingestion: ingestion.data,
    skills,
    facts: facts.data || [],
    needsBootstrap: !twin.data && !ingestion.data,
    freshness: {
      twin: twin.data?.observed_at || null,
      snapshot: snapshot.data?.period_end || null,
      narrative: narrative.data?.period_end || null,
      ingestion: ingestion.data?.completed_at || ingestion.data?.started_at || null,
    },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  try {
    const state = await latestPlatformState(auth.context.tenantId);
    return NextResponse.json({
      ok: true,
      tenantId: auth.context.tenantId,
      ...state,
      requestId: auth.context.requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Company Brain state failed.",
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
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "refresh");
    if (action !== "refresh" && action !== "bootstrap") {
      return NextResponse.json(
        { ok: false, error: "Unsupported Company Brain action.", requestId: auth.context.requestId },
        { status: 400 }
      );
    }

    if (action === "bootstrap") {
      const current = await latestPlatformState(auth.context.tenantId);
      if (!current.needsBootstrap) {
        return NextResponse.json({
          ok: true,
          tenantId: auth.context.tenantId,
          bootstrapped: false,
          ...current,
          requestId: auth.context.requestId,
        });
      }
    }

    const cycle = await runCompanyBrainCycle(auth.context.tenantId, auth.context.actor.id);
    const state = await latestPlatformState(auth.context.tenantId);
    return NextResponse.json({
      ok: true,
      tenantId: auth.context.tenantId,
      bootstrapped: action === "bootstrap",
      cycle: {
        warehouse: cycle.warehouse,
        snapshotId: cycle.snapshotId,
        twinId: cycle.twinId,
        predictionCount: cycle.predictionIds.length,
        recommendationCount: cycle.recommendationIds.length,
        skillInstallationCount: cycle.skillInstallationIds.length,
      },
      ...state,
      requestId: auth.context.requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Company Brain refresh failed.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}
