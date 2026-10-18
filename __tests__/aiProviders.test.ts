import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openai = vi.hoisted(() => ({ options: [] as unknown[], create: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openai.create } };
    constructor(options: unknown) { openai.options.push(options); }
  },
}));
vi.mock("../lib/supabase", () => ({ persist: vi.fn() }));

import { MODEL_TIMEOUT_MS, runAgent, runAgentRaw } from "../lib/ai";
import { _clearAiUsage, aiUsageSummary } from "../lib/aiUsage";

const AI_KEYS = ["AI_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_FALLBACK_MODELS", "ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "OPENAI_API_KEY"];
const saved = Object.fromEntries(AI_KEYS.map((key) => [key, process.env[key]]));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  _clearAiUsage();
  openai.options.length = 0;
  for (const key of AI_KEYS) delete process.env[key];
});
afterEach(() => {
  for (const key of AI_KEYS) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  vi.restoreAllMocks();
});

describe("model provider calls", () => {
  // A Vercel Hobby function is killed at 300 s; a structured call can make two
  // model calls, so each must end well before that.
  it("keeps two calls inside the function budget", () => {
    expect(MODEL_TIMEOUT_MS * 2).toBeLessThanOrEqual(120_000);
  });

  it("sends the Gemini key in a header, never in the URL, and bounds the call", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-test";
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ candidates: [{ content: { parts: [{ text: "ok" }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } }));
    await runAgentRaw("prompt", { agentName: "test" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(MODEL_TIMEOUT_MS);
  });

  it("bounds the Claude call", async () => {
    process.env.AI_PROVIDER = "claude";
    process.env.ANTHROPIC_API_KEY = "test-claude-key";
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ content: [{ text: "ok" }], usage: { input_tokens: 3, output_tokens: 2 } }));
    await runAgentRaw("prompt", { agentName: "test" });
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(MODEL_TIMEOUT_MS);
  });

  // The client's own default is 10 minutes per attempt with two retries.
  it("bounds the OpenAI client and retries at most once", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    openai.create.mockResolvedValue({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
    await runAgentRaw("prompt", { agentName: "test" });
    expect(openai.options[0]).toMatchObject({ apiKey: "test-openai-key", timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
  });

  it("answers a timeout in Arabic and records the failed call", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const text = await runAgent("prompt", { agentName: "test" });
    expect(text).toContain("لم يرد المزود");
    expect(aiUsageSummary().failedCalls).toBe(1);
  });
});
