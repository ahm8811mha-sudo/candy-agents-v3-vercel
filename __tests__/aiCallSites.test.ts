import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

  it("gives the government route room for a full document read", () => {
    expect(readFileSync("app/api/government-relations/route.ts", "utf8")).toMatch(/export const maxDuration = 300;/);
  });
});
