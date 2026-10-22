// @vitest-environment node
import { describe, expect, it } from "vitest";
import { describeFailure } from "@/lib/operations/cronRun";

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
});
