// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Production lacked decision_commitments, and the office showed an empty
// list: the read failed and the failure was returned as "nothing".
const read = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase", async (importOriginal) => {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "order"]) query[method] = () => query;
  query.limit = async () => read.result;
  return { ...(await importOriginal<typeof import("@/lib/supabase")>()), getSupabaseAdmin: () => ({ from: () => query }) };
});
import { listDecisionCommitments } from "@/lib/company/executiveSecretariat";

describe("reading the decision follow-up", () => {
  it("reports a failed read instead of an empty office", async () => {
    read.result = { data: null, error: { message: "Could not find the table 'public.decision_commitments' in the schema cache" } };
    await expect(listDecisionCommitments()).rejects.toThrow("تعذّرت قراءة متابعة القرارات من قاعدة البيانات.");
  });

  it("returns an empty list only when the read succeeded and found nothing", async () => {
    read.result = { data: [], error: null };
    await expect(listDecisionCommitments()).resolves.toEqual([]);
  });
});
