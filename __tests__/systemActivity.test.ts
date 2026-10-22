// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The owner digest and the executive report failed every morning in
// production: both wrote activity_logs with actor_id "system", and
// activity_logs.actor_id references employees, where no "system" exists.
const writes = vi.hoisted(() => [] as Array<{ table: string; row: Record<string, unknown> }>);
vi.mock("@/lib/supabase", async (importOriginal) => {
  const chain = (table: string): unknown => {
    const result = Promise.resolve({ data: [], error: null });
    return new Proxy(() => {}, {
      get(_target, key) {
        if (key === "then") return result.then.bind(result);
        if (key === "insert") return (row: Record<string, unknown>) => { writes.push({ table, row }); return chain(table); };
        return () => chain(table);
      },
    });
  };
  return {
    ...(await importOriginal<typeof import("@/lib/supabase")>()),
    getSupabaseAdmin: () => ({ from: (table: string) => chain(table), rpc: async () => ({ data: null, error: null }) }),
  };
});
import { dispatchDigest } from "@/lib/company/digest";

describe("activity the system records about itself", () => {
  it("names no employee as the actor of the daily digest", async () => {
    const { dispatch } = await dispatchDigest(new Date("2026-10-22T06:00:00Z"));
    expect(dispatch.recorded).toBe(true);
    const logged = writes.filter((write) => write.table === "activity_logs");
    expect(logged).toHaveLength(1);
    expect(logged[0].row).toMatchObject({ action: "DAILY_DIGEST_COMPOSED", actor_id: null });
  });

  it("never writes \"system\" where an employee id belongs", () => {
    const files = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
    const offenders = [...files("app"), ...files("lib")].filter((path) => /actor_id:\s*["']system["']/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
