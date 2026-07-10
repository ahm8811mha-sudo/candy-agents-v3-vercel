import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import type { DecisionPacket, KnowledgeEntityType } from "./types";

export type KnowledgeNodeInput = {
  tenantId: string;
  type: KnowledgeEntityType;
  externalId?: string;
  name: string;
  summary?: string;
  source: string;
  validFrom?: string;
  validTo?: string;
  metadata?: Record<string, unknown>;
};

export type KnowledgeEdgeInput = {
  tenantId: string;
  fromNodeId: string;
  toNodeId: string;
  relationship: string;
  validFrom?: string;
  validTo?: string;
  metadata?: Record<string, unknown>;
};

function requireKnowledgeStore() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for organizational memory.");
  return supabase;
}

export async function upsertKnowledgeNode(input: KnowledgeNodeInput) {
  const supabase = requireKnowledgeStore();
  if (!input.tenantId.trim()) throw new Error("tenantId is required.");
  if (!input.name.trim()) throw new Error("Knowledge node name is required.");
  const id = randomUUID();
  const row = {
    id,
    tenant_id: input.tenantId,
    node_type: input.type,
    external_id: input.externalId || null,
    name: input.name,
    summary: input.summary || null,
    source: input.source,
    valid_from: input.validFrom || new Date().toISOString(),
    valid_to: input.validTo || null,
    metadata: input.metadata || {},
  };

  if (input.externalId) {
    const { data, error } = await supabase
      .from("knowledge_nodes")
      .upsert(row, { onConflict: "tenant_id,node_type,external_id" })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from("knowledge_nodes").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function linkKnowledgeNodes(input: KnowledgeEdgeInput) {
  const supabase = requireKnowledgeStore();
  if (!input.relationship.trim()) throw new Error("Knowledge relationship is required.");
  const { data, error } = await supabase
    .from("knowledge_edges")
    .upsert(
      {
        id: randomUUID(),
        tenant_id: input.tenantId,
        from_node_id: input.fromNodeId,
        to_node_id: input.toNodeId,
        relationship: input.relationship,
        valid_from: input.validFrom || new Date().toISOString(),
        valid_to: input.validTo || null,
        metadata: input.metadata || {},
      },
      { onConflict: "tenant_id,from_node_id,to_node_id,relationship" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function rememberDecision(packet: DecisionPacket) {
  const decision = await upsertKnowledgeNode({
    tenantId: packet.tenantId,
    type: "DECISION",
    externalId: packet.id,
    name: packet.title,
    summary: packet.recommendation,
    source: "decision_packet",
    metadata: {
      riskLevel: packet.riskLevel,
      financialImpactSAR: packet.financialImpactSAR,
      assumptions: packet.assumptions,
      facts: packet.facts,
      requiredApprovals: packet.requiredApprovals,
      successCriteria: packet.successCriteria,
      killCriteria: packet.killCriteria,
      reviewAt: packet.reviewAt,
    },
  });

  const links: Array<{ type: KnowledgeEntityType; externalId?: string; name: string; relationship: string }> = [
    { type: "OBJECTIVE", externalId: packet.objectiveId, name: "Objective", relationship: "SUPPORTS_OBJECTIVE" },
    { type: "OPPORTUNITY", externalId: packet.opportunityId, name: "Opportunity", relationship: "DECIDES_ON" },
    { type: "PROJECT", externalId: packet.projectId, name: "Project", relationship: "AUTHORIZES_PROJECT" },
  ];

  for (const link of links.filter((item) => item.externalId)) {
    const target = await upsertKnowledgeNode({
      tenantId: packet.tenantId,
      type: link.type,
      externalId: link.externalId,
      name: link.name,
      source: "decision_packet_link",
    });
    await linkKnowledgeNodes({
      tenantId: packet.tenantId,
      fromNodeId: decision.id,
      toNodeId: target.id,
      relationship: link.relationship,
    });
  }

  return decision;
}

export async function recordOutcomeLesson(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  expectedOutcome: Record<string, unknown>;
  actualOutcome: Record<string, unknown>;
  forecastError?: Record<string, unknown>;
  rootCause?: string;
  lesson: string;
  policyChange?: string;
  playbookChange?: string;
}) {
  const supabase = requireKnowledgeStore();
  const { data, error } = await supabase
    .from("lessons_learned")
    .insert({
      tenant_id: input.tenantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      expected_outcome: input.expectedOutcome,
      actual_outcome: input.actualOutcome,
      forecast_error: input.forecastError || {},
      root_cause: input.rootCause || null,
      lesson: input.lesson,
      policy_change: input.policyChange || null,
      playbook_change: input.playbookChange || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function queryKnowledgeNeighborhood(input: { tenantId: string; externalId: string; limit?: number }) {
  const supabase = requireKnowledgeStore();
  const { data: node, error: nodeError } = await supabase
    .from("knowledge_nodes")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("external_id", input.externalId)
    .maybeSingle();
  if (nodeError) throw nodeError;
  if (!node) return { node: null, outgoing: [], incoming: [] };

  const limit = Math.min(Math.max(input.limit || 25, 1), 100);
  const [{ data: outgoing, error: outgoingError }, { data: incoming, error: incomingError }] = await Promise.all([
    supabase.from("knowledge_edges").select("*, to:knowledge_nodes!knowledge_edges_to_node_id_fkey(*)").eq("tenant_id", input.tenantId).eq("from_node_id", node.id).limit(limit),
    supabase.from("knowledge_edges").select("*, from:knowledge_nodes!knowledge_edges_from_node_id_fkey(*)").eq("tenant_id", input.tenantId).eq("to_node_id", node.id).limit(limit),
  ]);
  if (outgoingError) throw outgoingError;
  if (incomingError) throw incomingError;
  return { node, outgoing: outgoing || [], incoming: incoming || [] };
}
