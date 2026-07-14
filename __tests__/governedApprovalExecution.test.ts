import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const calls: Array<{
    table: string;
    values: Record<string, unknown>;
    filters: Array<{ kind: string; column: string; value: unknown }>;
  }> = [];

  function from(table: string) {
    let call: (typeof calls)[number];
    const query: any = {
      update(values: Record<string, unknown>) {
        call = { table, values, filters: [] };
        calls.push(call);
        return query;
      },
      eq(column: string, value: unknown) {
        call.filters.push({ kind: "eq", column, value });
        return query;
      },
      contains(column: string, value: unknown) {
        call.filters.push({ kind: "contains", column, value });
        return query;
      },
      then(resolve: (result: { error: null }) => unknown) {
        return Promise.resolve(resolve({ error: null }));
      },
    };
    return query;
  }

  return { calls, from: vi.fn(from) };
});

vi.mock("../lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: database.from }),
}));
vi.mock("../lib/tenant", () => ({
  getTenantId: () => "golden-star",
  isMultiTenantEnabled: () => false,
}));

import { executeGovernedApprovalDecision } from "../lib/company/governedApprovalExecution";

describe("governed approval execution", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.from.mockClear();
  });

  it("unblocks the campaign and its action after approval", async () => {
    await executeGovernedApprovalDecision(
      { actionKind: "MARKETING_CAMPAIGN", entityId: "campaign-1" },
      "APPROVED",
      "المالك"
    );

    expect(database.calls).toEqual([
      expect.objectContaining({ table: "marketing_campaigns", values: { status: "TESTING" } }),
      expect.objectContaining({
        table: "business_actions",
        values: { status: "QUEUED", approval_status: "APPROVED" },
      }),
    ]);
    expect(database.calls[1].filters).toContainEqual({
      kind: "contains",
      column: "payload",
      value: { campaign_id: "campaign-1" },
    });
  });

  it("rejects and cancels the governed campaign path", async () => {
    await executeGovernedApprovalDecision(
      { actionKind: "MARKETING_CAMPAIGN", entityId: "campaign-2" },
      "REJECTED",
      "المالك"
    );
    expect(database.calls[0].values).toEqual({ status: "REJECTED" });
    expect(database.calls[1].values).toEqual({ status: "CANCELLED", approval_status: "REJECTED" });
  });

  it("closes an accounting period only through its allow-listed transition", async () => {
    await executeGovernedApprovalDecision(
      { actionKind: "ACCOUNTING_PERIOD_CLOSE", entityId: "close-2026-07" },
      "APPROVED",
      "المالك"
    );
    expect(database.calls[0]).toEqual(
      expect.objectContaining({
        table: "accounting_period_closes",
        values: { status: "CLOSED", closed_by_role: "المالك" },
      })
    );
  });

  it("refuses arbitrary action kinds", async () => {
    await expect(
      executeGovernedApprovalDecision(
        { actionKind: "UPDATE_ANY_TABLE", entityId: "x" },
        "APPROVED",
        "المالك"
      )
    ).rejects.toThrow(/Unsupported governed action kind/);
    expect(database.calls).toHaveLength(0);
  });
});
