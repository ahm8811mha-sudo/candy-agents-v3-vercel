import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({ persist: vi.fn() }));

import { callOpenAIChat, callOpenAIResponses } from "../lib/ai/openai";
import { _clearAiUsage, aiUsageSummary } from "../lib/aiUsage";

const savedKey = process.env.OPENAI_API_KEY;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => { _clearAiUsage(); process.env.OPENAI_API_KEY = "test-openai-key"; });
afterEach(() => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  vi.restoreAllMocks();
});

describe("callOpenAIChat", () => {
  it("bounds the call, returns the text and records its cost", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ choices: [{ message: { content: "{\"a\":1}" } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } }));
    const result = await callOpenAIChat({ agentName: "regulatory-monitor", model: "gpt-4o-mini", messages: [{ role: "user", content: "x" }], responseFormat: "json_object", timeoutMs: 20_000 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" } });
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(result).toMatchObject({ text: "{\"a\":1}", inputTokens: 1000, outputTokens: 200 });
    const usage = aiUsageSummary();
    expect(usage.calls).toBe(1);
    expect(usage.byAgent[0]).toMatchObject({ agentName: "regulatory-monitor" });
    expect(usage.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("throws on an HTTP error and records the failed call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { message: "overloaded" } }, 503));
    await expect(callOpenAIChat({ agentName: "a", model: "gpt-4o-mini", messages: [{ role: "user", content: "x" }] })).rejects.toThrow("overloaded");
    expect(aiUsageSummary().failedCalls).toBe(1);
  });

  it("never calls out without a key", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(callOpenAIChat({ agentName: "a", model: "gpt-4o-mini", messages: [{ role: "user", content: "x" }] })).rejects.toThrow("OPENAI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("callOpenAIResponses", () => {
  it("reads output text and token usage from the Responses API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ output: [{ content: [{ text: "first" }, { text: "second" }] }], usage: { input_tokens: 1500, output_tokens: 300 } }));
    const result = await callOpenAIResponses({ agentName: "government-documents", model: "gpt-4.1-mini", content: [{ type: "input_text", text: "x" }], timeoutMs: 55_000 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(result).toMatchObject({ text: "first\nsecond", inputTokens: 1500, outputTokens: 300 });
    expect(aiUsageSummary().calls).toBe(1);
  });

  it("records a network failure as a failed call", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(callOpenAIResponses({ agentName: "g", model: "gpt-4.1-mini", content: [{ type: "input_text", text: "x" }], timeoutMs: 55_000 })).rejects.toThrow("fetch failed");
    expect(aiUsageSummary().failedCalls).toBe(1);
  });
});
