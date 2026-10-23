// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const updates = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));
import { describeFailure, failCronRun } from "@/lib/operations/cronRun";

// Production recorded the owner digest and the executive report as failing
// with "[object Object]": Supabase errors are plain objects, not Errors.
describe("recording why a cron run failed", () => {
  it("keeps a Supabase error's message, detail, hint and code", () => {
    const failure = { message: "Could not find the 'tenant_id' column of 'activity_logs' in the schema cache", code: "PGRST204", details: null, hint: "Check the column name." };
    expect(describeFailure(failure)).toEqual({
      code: "PGRST204",
      message: "Could not find the 'tenant_id' column of 'activity_logs' in the schema cache; Check the column name.",
    });
  });

  it("keeps an Error's name and message, and stringifies anything else", () => {
    expect(describeFailure(new TypeError("bad input"))).toEqual({ code: "TypeError", message: "bad input" });
    expect(describeFailure("timed out")).toEqual({ code: "CRON_FAILED", message: "timed out" });
    expect(describeFailure({ message: "no code" })).toEqual({ code: "CRON_FAILED", message: "no code" });
  });

  // The autonomy loop's failure at its last step, the outbox, erased the
  // heartbeat that showed how far it got (2026-10-23).
  it("keeps the last heartbeat's details unless the failure brings its own", async () => {
    const run = { id: "run-1", startedAt: Date.now(), tracked: true };
    updates.length = 0;
    await failCronRun(run, new Error("Outbox publishing is blocked"));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "FAILED", error_message: "Outbox publishing is blocked" });
    expect(updates[0]).not.toHaveProperty("details");

    await failCronRun(run, new Error("x"), { details: { phase: "outbox" } });
    expect(updates[1].details).toEqual({ phase: "outbox" });
  });
});
