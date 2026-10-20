import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// The only modules allowed to talk to a model provider: both bound every call
// in time and record it in the usage ledger.
const PROVIDER_CLIENTS = new Set(["lib/ai.ts", "lib/ai/openai.ts"]);
const PROVIDER_URL = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/;

// Live model calls go through lib/ai.ts or lib/ai/openai.ts, which bound them
// in time and record them in the usage ledger. A raw fetch to the provider
// runs unbounded and its cost never shows up.
const LIVE = ["lib/governmentRelations.ts", "lib/governmentRelationsV2.ts"];

describe("model call sites", () => {
  it.each(LIVE)("%s calls OpenAI only through the recorded helper", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("api.openai.com");
    expect(source).toMatch(/from "\.\/ai\/openai"/);
  });

  // Owner decision 2026-10-20 (Q8): the unbounded, unlogged paths that saved a
  // canned answer as if it were analysis are retired, not patched.
  it("leaves no model call outside the two recorded clients", () => {
    const offenders = [...sourceFiles("lib"), ...sourceFiles("app")]
      .filter((file) => !PROVIDER_CLIENTS.has(file) && PROVIDER_URL.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("gives the government route room for a full document read", () => {
    expect(readFileSync("app/api/government-relations/route.ts", "utf8")).toMatch(/export const maxDuration = 300;/);
  });
});
