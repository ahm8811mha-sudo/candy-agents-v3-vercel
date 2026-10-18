/**
 * Direct OpenAI calls outside the agent runner (document reading, the
 * regulatory monitor). Each call is bounded in time and recorded in the usage
 * ledger, so its cost is visible next to every agent call; before this, these
 * calls ran without a timeout and never reached the ledger.
 */

import { recordAiUsage } from "../aiUsage";

const OPENAI_URL = "https://api.openai.com/v1";

type Usage = { inputTokens: number; outputTokens: number };
export type OpenAICallResult = Usage & { text: string; latencyMs: number };

async function postOpenAI(
  path: "chat/completions" | "responses",
  body: Record<string, unknown>,
  meta: { agentName: string; model: string; timeoutMs: number },
  read: (payload: any) => Usage & { text: string }
): Promise<OpenAICallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const started = Date.now();
  const record = (ok: boolean, usage: Usage = { inputTokens: 0, outputTokens: 0 }) =>
    recordAiUsage({ agentName: meta.agentName, provider: "openai", model: meta.model, ...usage, durationMs: Date.now() - started, ok, demo: false });
  try {
    const response = await fetch(`${OPENAI_URL}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: meta.model, ...body }),
      signal: AbortSignal.timeout(meta.timeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error?.message || `OpenAI returned HTTP ${response.status}`).slice(0, 600));
    const result = read(payload);
    record(true, result);
    return { ...result, latencyMs: Date.now() - started };
  } catch (error) {
    record(false);
    throw error;
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };

export function callOpenAIChat(args: {
  agentName: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "json_object";
  timeoutMs?: number;
}): Promise<OpenAICallResult> {
  return postOpenAI(
    "chat/completions",
    {
      temperature: args.temperature ?? 0,
      messages: args.messages,
      ...(args.responseFormat ? { response_format: { type: args.responseFormat } } : {}),
    },
    { agentName: args.agentName, model: args.model, timeoutMs: args.timeoutMs ?? 45_000 },
    (payload) => ({
      text: String(payload?.choices?.[0]?.message?.content || ""),
      inputTokens: Number(payload?.usage?.prompt_tokens) || 0,
      outputTokens: Number(payload?.usage?.completion_tokens) || 0,
    })
  );
}

export type ResponsesInput = Array<
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string; detail?: "high" }
  | { type: "input_image"; image_url: string; detail: "high" }
>;

function responsesText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .map((part: any) => part?.text || part?.output_text || "")
    .filter(Boolean)
    .join("\n");
}

export function callOpenAIResponses(args: {
  agentName: string;
  model: string;
  content: ResponsesInput;
  timeoutMs: number;
}): Promise<OpenAICallResult> {
  return postOpenAI(
    "responses",
    { input: [{ role: "user", content: args.content }], temperature: 0 },
    { agentName: args.agentName, model: args.model, timeoutMs: args.timeoutMs },
    (payload) => ({
      text: responsesText(payload),
      inputTokens: Number(payload?.usage?.input_tokens) || 0,
      outputTokens: Number(payload?.usage?.output_tokens) || 0,
    })
  );
}
