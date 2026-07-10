import type { KnowledgeEdge, KnowledgeNode } from "./types";

export const REQUIRED_DECISION_LINKS = ["OPPORTUNITY", "PROJECT", "TRANSACTION", "OUTCOME"] as const;

export function validateDecisionKnowledgeLinks(input: {
  decisionNodeId: string;
  edges: KnowledgeEdge[];
  requiredTypes?: string[];
}) {
  const relationships = new Set(
    input.edges
      .filter((edge) => edge.fromNodeId === input.decisionNodeId || edge.toNodeId === input.decisionNodeId)
      .map((edge) => edge.relationship.toUpperCase())
  );
  const required = input.requiredTypes || [...REQUIRED_DECISION_LINKS];
  const missing = required.filter((item) => ![...relationships].some((relationship) => relationship.includes(item)));
  return { valid: missing.length === 0, missing };
}

export function closeTemporalNode(node: KnowledgeNode, validTo = new Date().toISOString()): KnowledgeNode {
  if (node.validTo) return node;
  if (new Date(validTo).getTime() < new Date(node.validFrom).getTime()) {
    throw new Error("validTo cannot be earlier than validFrom.");
  }
  return { ...node, validTo };
}

export type LessonInput = {
  expectedOutcome: Record<string, unknown>;
  actualOutcome: Record<string, unknown>;
  rootCause: string;
  lesson: string;
  policyChange?: string;
  playbookChange?: string;
};

export function buildLesson(input: LessonInput) {
  if (!input.rootCause.trim()) throw new Error("A lesson requires a root cause.");
  if (!input.lesson.trim()) throw new Error("A lesson requires a reusable conclusion.");
  return {
    expectedOutcome: input.expectedOutcome,
    actualOutcome: input.actualOutcome,
    rootCause: input.rootCause,
    lesson: input.lesson,
    policyChange: input.policyChange || null,
    playbookChange: input.playbookChange || null,
    createdAt: new Date().toISOString(),
  };
}

export const ORGANIZATIONAL_LEARNING_LOOP = [
  "Decision",
  "Execution",
  "Outcome",
  "Evaluation",
  "Lesson",
  "Policy or playbook update",
  "Better next decision",
];
