import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { extractJsonBlock, parseModelJson, runAgentStructured } from "../lib/aiStructured";
import { estimateCostUsd, recordAiUsage, aiUsageSummary, _clearAiUsage } from "../lib/aiUsage";

const decisionSchema = z.object({
  verdict: z.enum(["GO", "HOLD", "KILL"]),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1),
});

describe("structured agent outputs", () => {
  it("extracts JSON from fenced model answers", () => {
    const text = 'تفضل النتيجة:\n```json\n{"verdict":"GO","confidence":0.8,"reasons":["سوق واعد"]}\n```\nشكراً.';
    expect(extractJsonBlock(text)).toBe('{"verdict":"GO","confidence":0.8,"reasons":["سوق واعد"]}');
  });

  it("extracts bare JSON embedded in prose (with nested braces and strings)", () => {
    const text = 'القرار {"verdict":"HOLD","confidence":0.5,"reasons":["نص فيه } قوس"]} نهاية';
    const block = extractJsonBlock(text);
    expect(block).not.toBeNull();
    expect(JSON.parse(block!).verdict).toBe("HOLD");
  });

  it("validates against the schema and reports violations in a readable way", () => {
    const good = parseModelJson(decisionSchema, '{"verdict":"GO","confidence":0.9,"reasons":["a"]}');
    expect(good.data?.verdict).toBe("GO");

    const bad = parseModelJson(decisionSchema, '{"verdict":"MAYBE","confidence":2,"reasons":[]}');
    expect(bad.data).toBeNull();
    expect(bad.error).toContain("مخالفة المخطط");
  });

  it("rejects text with no JSON at all", () => {
    const result = parseModelJson(decisionSchema, "لا يوجد أي كائن هنا.");
    expect(result.data).toBeNull();
  });

  it("marks fallback (no provider) as demo and never fabricates data", async () => {
    // The test environment has no AI provider keys → fallback path.
    const result = await runAgentStructured("قيّم فكرة متجر إلكتروني", {
      agentName: "decision_agent",
      schema: decisionSchema,
      schemaDescription: '{"verdict":"GO|HOLD|KILL","confidence":0..1,"reasons":["..."]}',
    });
    expect(result.demo).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toContain("تجريبي");
  });
});

describe("ai usage ledger", () => {
  beforeEach(() => _clearAiUsage());

  it("estimates cost from the model price table", () => {
    expect(estimateCostUsd("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCostUsd("claude-3-5-haiku-latest", 0, 1_000_000)).toBeCloseTo(4, 5);
    expect(estimateCostUsd("some-unknown-model", 500, 500)).toBe(0);
  });

  it("aggregates calls per agent with demo/failure counters", () => {
    recordAiUsage({ agentName: "a", provider: "openai", model: "gpt-4o-mini", inputTokens: 1000, outputTokens: 500, durationMs: 10, ok: true, demo: false });
    recordAiUsage({ agentName: "a", provider: "fallback", model: "demo-fallback", durationMs: 1, ok: true, demo: true });
    recordAiUsage({ agentName: "b", provider: "openai", model: "gpt-4o-mini", durationMs: 5, ok: false, demo: false });

    const summary = aiUsageSummary();
    expect(summary.calls).toBe(3);
    expect(summary.demoCalls).toBe(1);
    expect(summary.failedCalls).toBe(1);
    expect(summary.byAgent.find((x) => x.agentName === "a")?.calls).toBe(2);
    expect(summary.estimatedCostUsd).toBeGreaterThan(0);
  });
});
