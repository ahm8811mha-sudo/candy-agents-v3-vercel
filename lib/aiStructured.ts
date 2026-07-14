/**
 * Structured agent outputs.
 *
 * Every governed decision that comes out of an LLM should be machine-checkable,
 * not free prose. runAgentStructured forces the model to answer as JSON, then
 * validates the payload against a zod schema before any business code sees it.
 * Demo fallbacks are always marked `demo: true` so a static canned answer can
 * never masquerade as real analysis in a decision flow.
 */

import type { ZodType } from "zod";
import { runAgentRaw } from "./ai";

export type StructuredAgentResult<T> = {
  ok: boolean;
  /** True when no AI provider is configured and the caller got no real answer. */
  demo: boolean;
  data: T | null;
  /** Raw model text, kept for audit/debugging. */
  raw: string;
  error?: string;
  provider: string;
  model: string;
};

/** Extract the first JSON object/array from model text (handles ```json fences). */
export function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;

  const opener = candidate[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === opener) depth += 1;
    if (char === closer) {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, index + 1);
    }
  }
  return null;
}

/** Parse + validate model text against a schema. Pure — easy to unit test. */
export function parseModelJson<T>(schema: ZodType<T>, text: string): { data: T | null; error?: string } {
  const block = extractJsonBlock(text);
  if (!block) return { data: null, error: "لم يُعثر على JSON في رد النموذج." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (error) {
    return { data: null, error: `JSON غير صالح: ${error instanceof Error ? error.message : String(error)}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join(" · ");
    return { data: null, error: `مخالفة المخطط: ${issues}` };
  }
  return { data: result.data };
}

export type StructuredAgentOptions<T> = {
  agentName: string;
  system?: string;
  schema: ZodType<T>;
  /** Human-readable description of the expected JSON fields, embedded in the prompt. */
  schemaDescription: string;
  /** One repair retry when the first answer fails to parse (default true). */
  retryOnParseError?: boolean;
};

function structuredPrompt(prompt: string, schemaDescription: string): string {
  return [
    prompt,
    "",
    "أجب بكائن JSON واحد فقط دون أي نص خارجه، بهذه البنية:",
    schemaDescription,
    "لا تضف حقولًا غير مذكورة، ولا تكتب شرحًا قبل JSON أو بعده.",
  ].join("\n");
}

export async function runAgentStructured<T>(
  prompt: string,
  options: StructuredAgentOptions<T>
): Promise<StructuredAgentResult<T>> {
  const { schema, schemaDescription, retryOnParseError = true, ...agentOptions } = options;

  let raw;
  try {
    raw = await runAgentRaw(structuredPrompt(prompt, schemaDescription), agentOptions);
  } catch (error) {
    return {
      ok: false,
      demo: false,
      data: null,
      raw: "",
      error: error instanceof Error ? error.message : String(error),
      provider: "unknown",
      model: "unknown",
    };
  }

  if (raw.demo) {
    // The static fallback is prose, not schema-shaped data. Never fabricate.
    return {
      ok: false,
      demo: true,
      data: null,
      raw: raw.text,
      error: "وضع تجريبي — لا يوجد مزود AI مهيأ، لا يمكن إنتاج قرار منظم.",
      provider: raw.provider,
      model: raw.model,
    };
  }

  let parsed = parseModelJson(schema, raw.text);

  if (!parsed.data && retryOnParseError) {
    try {
      const repair = await runAgentRaw(
        [
          "ردك السابق لم يطابق المطلوب:",
          raw.text.slice(0, 1500),
          "",
          `الخطأ: ${parsed.error}`,
          "",
          "أعد الإجابة الآن بكائن JSON صالح واحد فقط بهذه البنية:",
          schemaDescription,
        ].join("\n"),
        agentOptions
      );
      raw = repair;
      parsed = parseModelJson(schema, repair.text);
    } catch {
      // keep the original parse error
    }
  }

  return {
    ok: Boolean(parsed.data),
    demo: false,
    data: parsed.data,
    raw: raw.text,
    error: parsed.data ? undefined : parsed.error,
    provider: raw.provider,
    model: raw.model,
  };
}
