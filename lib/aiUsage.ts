/**
 * LLM usage ledger.
 *
 * Every agent call is recorded with provider, model, token counts, an
 * estimated cost, and whether the caller received a real model answer or a
 * demo fallback. The in-memory ring buffer powers quick summaries; when
 * Supabase is configured each record is also persisted to `ai_usage_log`
 * (non-blocking — usage telemetry must never fail a business request).
 */

import { persist } from "./supabase";

export type AiUsageRecord = {
  id: string;
  agentName: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  ok: boolean;
  demo: boolean;
  createdAt: string;
};

const MAX_BUFFER = 500;
const buffer: AiUsageRecord[] = [];

/** USD per 1M tokens (input, output). Unknown models cost 0 — measured, not guessed. */
const PRICE_PER_MILLION: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /gpt-4o-mini/i, input: 0.15, output: 0.6 },
  { match: /gpt-4o/i, input: 2.5, output: 10 },
  { match: /gpt-4\.1-mini/i, input: 0.4, output: 1.6 },
  { match: /gpt-4\.1/i, input: 2, output: 8 },
  { match: /claude.*haiku/i, input: 0.8, output: 4 },
  { match: /claude.*sonnet/i, input: 3, output: 15 },
  { match: /claude.*opus/i, input: 15, output: 75 },
  { match: /gemini.*flash-lite/i, input: 0.1, output: 0.4 },
  { match: /gemini.*flash/i, input: 0.3, output: 2.5 },
  { match: /gemini.*pro/i, input: 1.25, output: 10 },
];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MILLION.find((entry) => entry.match.test(model));
  if (!price) return 0;
  const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function recordAiUsage(input: {
  agentName: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  ok: boolean;
  demo: boolean;
}): AiUsageRecord {
  const record: AiUsageRecord = {
    id: `aiu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentName: input.agentName,
    provider: input.provider,
    model: input.model,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    estimatedCostUsd: estimateCostUsd(input.model, input.inputTokens ?? 0, input.outputTokens ?? 0),
    durationMs: input.durationMs,
    ok: input.ok,
    demo: input.demo,
    createdAt: new Date().toISOString(),
  };

  buffer.unshift(record);
  if (buffer.length > MAX_BUFFER) buffer.length = MAX_BUFFER;

  persist("ai_usage_log", {
    id: record.id,
    agent_name: record.agentName,
    provider: record.provider,
    model: record.model,
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    estimated_cost_usd: record.estimatedCostUsd,
    duration_ms: record.durationMs,
    ok: record.ok,
    demo: record.demo,
    created_at: record.createdAt,
  });

  return record;
}

export function aiUsageSummary(): {
  calls: number;
  demoCalls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  byAgent: Array<{ agentName: string; calls: number; estimatedCostUsd: number }>;
} {
  const byAgent = new Map<string, { calls: number; cost: number }>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let demoCalls = 0;
  let failedCalls = 0;

  for (const record of buffer) {
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
    cost += record.estimatedCostUsd;
    if (record.demo) demoCalls += 1;
    if (!record.ok) failedCalls += 1;
    const agent = byAgent.get(record.agentName) || { calls: 0, cost: 0 };
    agent.calls += 1;
    agent.cost += record.estimatedCostUsd;
    byAgent.set(record.agentName, agent);
  }

  return {
    calls: buffer.length,
    demoCalls,
    failedCalls,
    inputTokens,
    outputTokens,
    estimatedCostUsd: Math.round(cost * 1_000_000) / 1_000_000,
    byAgent: [...byAgent.entries()]
      .map(([agentName, value]) => ({
        agentName,
        calls: value.calls,
        estimatedCostUsd: Math.round(value.cost * 1_000_000) / 1_000_000,
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
  };
}

/** Test helper. */
export function _clearAiUsage(): void {
  buffer.length = 0;
}
