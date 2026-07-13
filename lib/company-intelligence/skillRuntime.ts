import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import {
  buildCompanySnapshot,
  createAutonomousPlan,
  createExecutiveNarrative,
  generateRecommendations,
  runSimulation,
  type PlanInput,
  type SimulationInput,
} from "./engine";
import { refreshGovernmentRegulations, syncGovernmentDocumentCompliance } from "../governmentRelations";

export type SkillRunRequest = {
  tenantId: string;
  slug: string;
  version?: string;
  idempotencyKey: string;
  input?: Record<string, unknown>;
  actorId: string;
};

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for skills execution.");
  return supabase;
}

export async function listInstalledSkills(tenantId: string) {
  const supabase = requireSupabase();
  const { data: installations, error } = await supabase
    .from("skill_installations")
    .select("id,tenant_id,skill_id,configuration,enabled,installed_at,updated_at")
    .eq("tenant_id", tenantId)
    .eq("enabled", true)
    .order("installed_at", { ascending: true });
  if (error) throw error;

  const skillIds = (installations || []).map((row) => row.skill_id);
  if (!skillIds.length) return [];
  const { data: definitions, error: definitionsError } = await supabase
    .from("skill_definitions")
    .select("id,slug,version,name,description,category,manifest,execution_mode,risk_level,approval_required,status")
    .in("id", skillIds)
    .eq("status", "ACTIVE");
  if (definitionsError) throw definitionsError;
  const byId = new Map((definitions || []).map((row) => [String(row.id), row]));

  return (installations || [])
    .map((installation) => ({ ...installation, definition: byId.get(String(installation.skill_id)) }))
    .filter((row) => Boolean(row.definition));
}

export async function requestSkillRun(input: SkillRunRequest) {
  const supabase = requireSupabase();
  const version = input.version || "1.0.0";
  const { data: definition, error: definitionError } = await supabase
    .from("skill_definitions")
    .select("id,slug,version,name,execution_mode,risk_level,approval_required,status")
    .eq("slug", input.slug)
    .eq("version", version)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (definitionError) throw definitionError;
  if (!definition) throw new Error(`Skill ${input.slug}@${version} is not active.`);

  const { data: installation, error: installationError } = await supabase
    .from("skill_installations")
    .select("id,enabled")
    .eq("tenant_id", input.tenantId)
    .eq("skill_id", definition.id)
    .eq("enabled", true)
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation) throw new Error(`Skill ${input.slug}@${version} is not installed for this company.`);

  const initialStatus = definition.approval_required ? "AWAITING_APPROVAL" : "QUEUED";
  const runId = randomUUID();
  const { data: existing } = await supabase
    .from("skill_runs")
    .select("id,status,output,error_message")
    .eq("tenant_id", input.tenantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) return { ...existing, idempotent: true, approvalRequired: definition.approval_required };

  const { error: insertError } = await supabase.from("skill_runs").insert({
    id: runId,
    tenant_id: input.tenantId,
    installation_id: installation.id,
    idempotency_key: input.idempotencyKey,
    input: input.input || {},
    status: initialStatus,
    requested_by: input.actorId,
  });
  if (insertError) throw insertError;

  if (definition.approval_required) {
    return { id: runId, status: initialStatus, idempotent: false, approvalRequired: true };
  }

  const result = await executeSkillRun({ tenantId: input.tenantId, runId, actorId: input.actorId, approve: false });
  return { ...result, idempotent: false, approvalRequired: false };
}

export async function executeSkillRun(input: { tenantId: string; runId: string; actorId: string; approve?: boolean }) {
  const supabase = requireSupabase();
  const { data: run, error: runError } = await supabase
    .from("skill_runs")
    .select("id,installation_id,input,status,output,error_message")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.runId)
    .maybeSingle();
  if (runError) throw runError;
  if (!run) throw new Error("Skill run was not found.");
  if (run.status === "SUCCEEDED") return { id: run.id, status: run.status, output: run.output, idempotent: true };
  if (["FAILED", "CANCELLED"].includes(run.status)) throw new Error(run.error_message || `Skill run is ${run.status}.`);

  const { data: installation, error: installationError } = await supabase
    .from("skill_installations")
    .select("id,skill_id,enabled,configuration")
    .eq("tenant_id", input.tenantId)
    .eq("id", run.installation_id)
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation?.enabled) throw new Error("Skill installation is disabled.");

  const { data: definition, error: definitionError } = await supabase
    .from("skill_definitions")
    .select("slug,version,approval_required,status")
    .eq("id", installation.skill_id)
    .maybeSingle();
  if (definitionError) throw definitionError;
  if (!definition || definition.status !== "ACTIVE") throw new Error("Skill definition is unavailable.");

  if (definition.approval_required && run.status === "AWAITING_APPROVAL" && !input.approve) {
    return { id: run.id, status: "AWAITING_APPROVAL", output: run.output };
  }

  const startedAt = new Date().toISOString();
  await supabase.from("skill_runs").update({
    status: "RUNNING",
    approved_by: definition.approval_required ? input.actorId : null,
    approved_at: definition.approval_required ? startedAt : null,
    started_at: startedAt,
    updated_at: startedAt,
  }).eq("id", run.id);

  try {
    const output = await executeBuiltin(definition.slug, input.tenantId, (run.input || {}) as Record<string, unknown>);
    const completedAt = new Date().toISOString();
    const { error: completionError } = await supabase.from("skill_runs").update({
      status: "SUCCEEDED",
      output,
      completed_at: completedAt,
      updated_at: completedAt,
      error_message: null,
    }).eq("id", run.id);
    if (completionError) throw completionError;
    return { id: run.id, status: "SUCCEEDED", output };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("skill_runs").update({
      status: "FAILED",
      completed_at: completedAt,
      updated_at: completedAt,
      error_message: message.slice(0, 2000),
    }).eq("id", run.id);
    throw error;
  }
}

async function executeBuiltin(slug: string, tenantId: string, input: Record<string, unknown>) {
  if (slug === "executive-decision-brief") {
    const snapshot = await buildCompanySnapshot(tenantId);
    const recommendations = generateRecommendations(snapshot);
    const narrative = createExecutiveNarrative(snapshot, recommendations);
    return { snapshot, recommendations, narrative };
  }

  if (slug === "company-simulation") {
    return runSimulation(input as unknown as SimulationInput);
  }

  if (slug === "autonomous-planner") {
    return createAutonomousPlan(input as unknown as PlanInput);
  }

  if (slug === "government-document-control") {
    const [regulations, compliance] = await Promise.all([
      refreshGovernmentRegulations({ force: true }),
      syncGovernmentDocumentCompliance(),
    ]);
    return {
      regulations,
      compliance,
      executionMode: "SERVER_WITH_HUMAN_CHECKPOINT_FOR_PORTAL_SUBMISSION",
      completedAt: new Date().toISOString(),
    };
  }

  throw new Error(`No trusted executor is registered for skill ${slug}.`);
}
