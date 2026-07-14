import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import {
  buildCompanySnapshot,
  createExecutiveNarrative,
  generateRecommendations,
  persistRecommendations,
  persistSnapshot,
  type CompanySnapshot,
} from "./engine";

export type DigitalTwin = {
  tenantId: string;
  observedAt: string;
  healthScore: number;
  maturityScore: number;
  domains: Record<string, { score: number; status: "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL"; drivers: string[] }>;
  capacity: Record<string, number>;
  constraints: Array<{ code: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; detail: string }>;
  state: Record<string, unknown>;
};

export type CompanyPrediction = {
  predictionType: string;
  subjectType: string;
  subjectId: string;
  horizonDays: number;
  probability: number;
  confidence: number;
  dataQuality: number;
  prediction: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  limitations: string[];
};

type IngestionSource = {
  table: string;
  entityType: string;
  titleKeys: string[];
  summaryKeys: string[];
  statusKeys: string[];
  dateKeys: string[];
  limit: number;
};

const SOURCES: IngestionSource[] = [
  { table: "company_decisions", entityType: "DECISION", titleKeys: ["title", "subject", "summary"], summaryKeys: ["rationale", "description", "summary"], statusKeys: ["status"], dateKeys: ["updated_at", "created_at"], limit: 500 },
  { table: "workflow_instances", entityType: "WORKFLOW", titleKeys: ["title", "workflow_type", "name"], summaryKeys: ["description", "current_step", "status"], statusKeys: ["status"], dateKeys: ["updated_at", "created_at"], limit: 500 },
  { table: "gov_documents", entityType: "GOVERNMENT_DOCUMENT", titleKeys: ["title", "document_type", "document_number"], summaryKeys: ["issuer", "activity", "analysis_status"], statusKeys: ["status", "analysis_status", "automation_status"], dateKeys: ["expiry_date", "renewal_date", "updated_at", "created_at"], limit: 1000 },
  { table: "system_alerts", entityType: "SYSTEM_ALERT", titleKeys: ["title", "dedupe_key"], summaryKeys: ["message", "source"], statusKeys: ["status", "severity"], dateKeys: ["last_seen_at", "updated_at", "created_at"], limit: 500 },
  { table: "integration_attempts", entityType: "INTEGRATION_ATTEMPT", titleKeys: ["operation", "integration"], summaryKeys: ["error_message", "status"], statusKeys: ["status"], dateKeys: ["completed_at", "started_at", "created_at"], limit: 500 },
  { table: "accounting_journal_entries", entityType: "JOURNAL_ENTRY", titleKeys: ["memo", "entry_number"], summaryKeys: ["source", "status"], statusKeys: ["status"], dateKeys: ["entry_date", "created_at"], limit: 1000 },
];

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for the company intelligence platform.");
  return supabase;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function firstText(row: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function rowId(row: Record<string, unknown>) {
  return String(row.id || row.uuid || row.reference || randomUUID());
}

function latestDate(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  }
  return new Date().toISOString();
}

function scoreStatus(score: number): "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL" {
  if (score >= 80) return "HEALTHY";
  if (score >= 65) return "WATCH";
  if (score >= 45) return "AT_RISK";
  return "CRITICAL";
}

async function readSource(source: IngestionSource, tenantId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(source.table)
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(source.limit);
  if (error) {
    console.error("[orvanta:warehouse] source read failed", { table: source.table, error: error.message });
    return { rows: [] as Record<string, unknown>[], error: error.message };
  }
  return { rows: (data || []) as Record<string, unknown>[], error: null };
}

export async function materializeCompanyWarehouse(tenantId: string) {
  const supabase = requireSupabase();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const { error: startError } = await supabase.from("company_ingestion_runs").insert({
    id: runId,
    tenant_id: tenantId,
    pipeline: "operational-to-company-brain-v1",
    status: "STARTED",
    started_at: startedAt,
  });
  if (startError) throw startError;

  let rowsRead = 0;
  let nodesUpserted = 0;
  let featuresWritten = 0;
  let factsWritten = 0;
  let failures = 0;
  const sourceResults: Record<string, unknown> = {};

  try {
    for (const source of SOURCES) {
      const sourceRead = await readSource(source, tenantId);
      const rows = sourceRead.rows;
      if (sourceRead.error) failures += 1;
      rowsRead += rows.length;
      let sourceNodes = 0;
      let sourceFeatures = 0;

      for (const row of rows) {
        const entityId = rowId(row);
        const title = firstText(row, source.titleKeys, `${source.entityType} ${entityId}`);
        const summary = firstText(row, source.summaryKeys);
        const status = firstText(row, source.statusKeys, "UNKNOWN");
        const observedAt = latestDate(row, source.dateKeys);
        const attributes = { ...row, warehouseSource: source.table, normalizedStatus: status };

        const { error: nodeError } = await supabase.from("company_knowledge_nodes").upsert(
          {
            tenant_id: tenantId,
            entity_type: source.entityType,
            entity_id: entityId,
            title,
            summary,
            attributes,
            source: source.table,
            confidence: 1,
            observed_at: observedAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,entity_type,entity_id" }
        );
        if (nodeError) {
          failures += 1;
          continue;
        }
        sourceNodes += 1;
        nodesUpserted += 1;

        const featureRows = [
          {
            tenant_id: tenantId,
            entity_type: source.entityType,
            entity_id: entityId,
            feature_key: "status",
            text_value: status,
            source: source.table,
            confidence: 1,
            observed_at: observedAt,
          },
          {
            tenant_id: tenantId,
            entity_type: source.entityType,
            entity_id: entityId,
            feature_key: "age_days",
            numeric_value: Math.max(0, Math.floor((Date.now() - new Date(observedAt).getTime()) / 86_400_000)),
            unit: "days",
            source: source.table,
            confidence: 0.95,
            observed_at: observedAt,
          },
        ];
        const { error: featureError } = await supabase.from("company_feature_values").upsert(
          featureRows,
          { onConflict: "tenant_id,entity_type,entity_id,feature_key,source,observed_at" }
        );
        if (!featureError) {
          sourceFeatures += featureRows.length;
          featuresWritten += featureRows.length;
        } else {
          failures += 1;
        }
      }

      const factDate = new Date().toISOString().slice(0, 10);
      const { error: factError } = await supabase.from("company_fact_daily").upsert(
        {
          tenant_id: tenantId,
          fact_date: factDate,
          domain: source.entityType,
          metric_key: "record_count",
          numeric_value: rows.length,
          unit: "records",
          source: source.table,
          source_reference: "daily-materialization",
          quality_score: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,fact_date,domain,metric_key,source,source_reference" }
      );
      if (!factError) factsWritten += 1;
      else failures += 1;

      sourceResults[source.table] = {
        rows: rows.length,
        nodes: sourceNodes,
        features: sourceFeatures,
        error: sourceRead.error,
      };
    }

    const status = failures === 0 ? "SUCCEEDED" : "PARTIAL";
    const { error: completionError } = await supabase.from("company_ingestion_runs").update({
      status,
      completed_at: new Date().toISOString(),
      rows_read: rowsRead,
      nodes_upserted: nodesUpserted,
      features_written: featuresWritten,
      facts_written: factsWritten,
      failures,
      details: sourceResults,
    }).eq("id", runId);
    if (completionError) throw completionError;

    return { runId, status, rowsRead, nodesUpserted, featuresWritten, factsWritten, failures, sources: sourceResults };
  } catch (error) {
    const { error: failureUpdateError } = await supabase.from("company_ingestion_runs").update({
      status: "FAILED",
      completed_at: new Date().toISOString(),
      rows_read: rowsRead,
      nodes_upserted: nodesUpserted,
      features_written: featuresWritten,
      facts_written: factsWritten,
      failures: failures + 1,
      error_message: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
      details: sourceResults,
    }).eq("id", runId);
    if (failureUpdateError) {
      console.error("[orvanta:warehouse] failed to persist terminal ingestion state", {
        runId,
        error: failureUpdateError.message,
      });
    }
    throw error;
  }
}

export function buildDigitalTwin(snapshot: CompanySnapshot): DigitalTwin {
  const operationalPenalty = snapshot.metrics.openCriticalAlerts * 16 + snapshot.metrics.failedIntegrations * 6;
  const decisionPenalty = Math.min(25, snapshot.metrics.openDecisions * 2.5);
  const dataPenalty = snapshot.metrics.postedJournalEntries === 0 ? 22 : snapshot.metrics.postedJournalEntries < 10 ? 8 : 0;
  const executionScore = clamp(88 - operationalPenalty - Math.max(0, snapshot.metrics.activeWorkflows - 12));
  const decisionScore = clamp(90 - decisionPenalty);
  const financeScore = clamp(92 - dataPenalty);
  const complianceScore = clamp(88 - Math.max(0, snapshot.metrics.governmentDocuments === 0 ? 15 : 0));
  const reliabilityScore = clamp(95 - operationalPenalty);
  const healthScore = Math.round((executionScore * 0.28 + decisionScore * 0.18 + financeScore * 0.2 + complianceScore * 0.14 + reliabilityScore * 0.2) * 100) / 100;
  const maturityScore = Math.round(clamp(42 + snapshot.metrics.postedJournalEntries * 0.8 + snapshot.metrics.governmentDocuments * 0.7 - snapshot.metrics.failedIntegrations * 1.5) * 100) / 100;

  const constraints: DigitalTwin["constraints"] = snapshot.risks.map((risk) => ({
    code: risk.code,
    severity: risk.severity,
    detail: risk.detail,
  }));

  return {
    tenantId: snapshot.tenantId,
    observedAt: snapshot.generatedAt,
    healthScore,
    maturityScore,
    domains: {
      execution: { score: executionScore, status: scoreStatus(executionScore), drivers: [`${snapshot.metrics.activeWorkflows} workflows active`, `${snapshot.metrics.failedIntegrations} failed integrations`] },
      decisions: { score: decisionScore, status: scoreStatus(decisionScore), drivers: [`${snapshot.metrics.openDecisions} open decisions`] },
      finance: { score: financeScore, status: scoreStatus(financeScore), drivers: [`${snapshot.metrics.postedJournalEntries} posted journal entries`] },
      compliance: { score: complianceScore, status: scoreStatus(complianceScore), drivers: [`${snapshot.metrics.governmentDocuments} government documents`] },
      reliability: { score: reliabilityScore, status: scoreStatus(reliabilityScore), drivers: [`${snapshot.metrics.openCriticalAlerts} critical alerts`] },
    },
    capacity: {
      activeWorkflows: snapshot.metrics.activeWorkflows,
      decisionBacklog: snapshot.metrics.openDecisions,
      integrationFailures: snapshot.metrics.failedIntegrations,
    },
    constraints,
    state: { metrics: snapshot.metrics, risks: snapshot.risks, opportunities: snapshot.opportunities, freshness: snapshot.freshness },
  };
}

export async function persistDigitalTwin(twin: DigitalTwin, snapshotId?: string | null) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("company_twin_states").upsert(
    {
      tenant_id: twin.tenantId,
      scope_type: "COMPANY",
      scope_id: "root",
      health_score: twin.healthScore,
      maturity_score: twin.maturityScore,
      capacity: twin.capacity,
      constraints: twin.constraints,
      state: { domains: twin.domains, ...twin.state },
      source_snapshot_id: snapshotId || null,
      observed_at: twin.observedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,scope_type,scope_id" }
  ).select("id").single();
  if (error) throw error;
  return String(data.id);
}

export function predictCompanyRisks(snapshot: CompanySnapshot, twin: DigitalTwin): CompanyPrediction[] {
  const dataSignals = 6;
  const availableSignals = Object.values(snapshot.metrics).filter((value) => Number.isFinite(value)).length;
  const dataQuality = Math.min(1, availableSignals / dataSignals);
  const predictions: CompanyPrediction[] = [];

  const operationalProbability = Math.min(0.98, 0.08 + snapshot.metrics.openCriticalAlerts * 0.24 + snapshot.metrics.failedIntegrations * 0.08);
  predictions.push({
    predictionType: "OPERATIONAL_DISRUPTION",
    subjectType: "COMPANY",
    subjectId: "root",
    horizonDays: 14,
    probability: operationalProbability,
    confidence: Math.min(0.94, 0.55 + dataQuality * 0.35),
    dataQuality,
    prediction: { likely: operationalProbability >= 0.5, severity: operationalProbability >= 0.75 ? "CRITICAL" : operationalProbability >= 0.45 ? "HIGH" : "MEDIUM", recommendedAction: "Resolve critical alerts and uncertain external executions before increasing workload." },
    evidence: [{ openCriticalAlerts: snapshot.metrics.openCriticalAlerts }, { failedIntegrations: snapshot.metrics.failedIntegrations }, { reliabilityScore: twin.domains.reliability.score }],
    limitations: ["Prediction uses operational event counts; it does not yet include infrastructure latency or external provider SLA history."],
  });

  const decisionDelayProbability = Math.min(0.95, snapshot.metrics.openDecisions <= 2 ? 0.12 : 0.18 + snapshot.metrics.openDecisions * 0.07);
  predictions.push({
    predictionType: "DECISION_DELAY",
    subjectType: "COMPANY",
    subjectId: "root",
    horizonDays: 7,
    probability: decisionDelayProbability,
    confidence: 0.78 * dataQuality,
    dataQuality,
    prediction: { likely: decisionDelayProbability >= 0.5, backlog: snapshot.metrics.openDecisions, recommendedAction: "Prioritize decisions by risk-adjusted value and expiration cost." },
    evidence: [{ openDecisions: snapshot.metrics.openDecisions }, { decisionScore: twin.domains.decisions.score }],
    limitations: ["The model does not yet measure individual approver response time."],
  });

  const financialBlindSpot = snapshot.metrics.postedJournalEntries === 0 ? 0.95 : snapshot.metrics.postedJournalEntries < 10 ? 0.62 : 0.18;
  predictions.push({
    predictionType: "FINANCIAL_DECISION_BLIND_SPOT",
    subjectType: "COMPANY",
    subjectId: "root",
    horizonDays: 30,
    probability: financialBlindSpot,
    confidence: 0.9,
    dataQuality,
    prediction: { likely: financialBlindSpot >= 0.5, recommendedAction: "Complete actual accounting ingestion and reconciliation before accepting financial forecasts." },
    evidence: [{ postedJournalEntries: snapshot.metrics.postedJournalEntries }, { financeScore: twin.domains.finance.score }],
    limitations: ["Cash balance, receivables ageing, and bank feeds are required for cash-stress prediction."],
  });

  return predictions;
}

export async function persistPredictions(tenantId: string, predictions: CompanyPrediction[]) {
  if (!predictions.length) return [] as string[];
  const supabase = requireSupabase();
  const rows = predictions.map((item) => ({
    id: randomUUID(),
    tenant_id: tenantId,
    prediction_type: item.predictionType,
    subject_type: item.subjectType,
    subject_id: item.subjectId,
    horizon_days: item.horizonDays,
    input_features: item.evidence,
    prediction: item.prediction,
    probability: item.probability,
    confidence: item.confidence,
    data_quality: item.dataQuality,
    model_version: "evidence-rules-v1",
    evidence: item.evidence,
    limitations: item.limitations,
    valid_until: new Date(Date.now() + item.horizonDays * 86_400_000).toISOString(),
  }));
  const { data, error } = await supabase.from("company_prediction_runs").insert(rows).select("id");
  if (error) throw error;
  return (data || []).map((row) => String(row.id));
}

export async function installBuiltinSkills(tenantId: string, actorId: string) {
  const supabase = requireSupabase();
  const { data: skills, error: skillError } = await supabase
    .from("skill_definitions")
    .select("id,slug,version")
    .eq("status", "ACTIVE");
  if (skillError) throw skillError;

  const rows = (skills || []).map((skill) => ({
    tenant_id: tenantId,
    skill_id: skill.id,
    configuration: { installedFrom: "builtin", slug: skill.slug, version: skill.version },
    enabled: true,
    installed_by: actorId,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return [] as string[];
  const { data, error } = await supabase.from("skill_installations").upsert(rows, { onConflict: "tenant_id,skill_id" }).select("id");
  if (error) throw error;
  return (data || []).map((row) => String(row.id));
}

export async function runCompanyBrainCycle(tenantId: string, actorId = "company-brain") {
  const warehouse = await materializeCompanyWarehouse(tenantId);
  const snapshot = await buildCompanySnapshot(tenantId);
  const snapshotId = await persistSnapshot(snapshot);
  const twin = buildDigitalTwin(snapshot);
  const twinId = await persistDigitalTwin(twin, snapshotId);
  const predictions = predictCompanyRisks(snapshot, twin);
  const predictionIds = await persistPredictions(tenantId, predictions);
  const recommendations = generateRecommendations(snapshot);
  const recommendationIds = await persistRecommendations(tenantId, recommendations);
  const narrative = createExecutiveNarrative(snapshot, recommendations);
  const skillInstallationIds = await installBuiltinSkills(tenantId, actorId);

  const supabase = requireSupabase();
  const { data: narrativeRow, error: narrativeError } = await supabase.from("executive_narratives").insert({
    tenant_id: tenantId,
    narrative_type: "COMPANY_BRAIN_CYCLE",
    period_end: snapshot.generatedAt,
    headline: narrative.headline,
    narrative: narrative.narrative,
    drivers: narrative.drivers,
    risks: snapshot.risks,
    recommended_actions: narrative.recommendedActions,
    confidence: narrative.confidence,
    source_snapshot_id: snapshotId,
  }).select("id").single();
  if (narrativeError) throw narrativeError;

  const cycleSucceeded = warehouse.status === "SUCCEEDED";
  const { error: evidenceError } = await supabase.from("readiness_evidence").insert({
    evidence_key: "company-brain-cycle",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    status: cycleSucceeded ? "PASS" : "FAIL",
    details: {
      tenantId,
      ingestionRunId: warehouse.runId,
      ingestionStatus: warehouse.status,
      failures: warehouse.failures,
      snapshotId,
      twinId,
      predictionCount: predictionIds.length,
      recommendationCount: recommendationIds.length,
    },
    performed_by: actorId,
    performed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 36 * 60 * 60_000).toISOString(),
  });
  if (evidenceError) throw evidenceError;

  return {
    warehouse,
    snapshotId,
    twinId,
    twin,
    predictionIds,
    predictions,
    recommendationIds,
    recommendations,
    narrativeId: String(narrativeRow.id),
    narrative,
    skillInstallationIds,
  };
}
