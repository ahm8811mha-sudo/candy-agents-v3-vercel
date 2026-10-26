import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { failUpsert: false, rows: [] as Record<string, unknown>[] };
vi.mock("../lib/supabase", async (orig) => {
  const actual = await orig<typeof import("../lib/supabase")>();
  const table = (name: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain, eq: chain, order: chain, limit: chain, in: chain,
      range: async () => ({ data: name === "company_approvals" ? state.rows : [], error: null }),
      then: (r: (v: unknown) => void) => r({ data: [], error: null }),
      upsert: async () => state.failUpsert ? { error: { code: "XX000", message: "boom" } } : { error: null },
      insert: async () => state.failUpsert ? { error: { code: "XX000", message: "boom" } } : { error: null },
    });
    return q;
  };
  return {
    ...actual,
    hasSupabaseEnv: () => true,
    getSupabaseAdmin: () => ({ from: table, rpc: async () => ({ data: null, error: null }) }),
    persistCritical: async () => { if (state.failUpsert) throw new Error("boom"); },
    persist: () => {},
  };
});

import { writeApprovalCritical, listApprovals, _clearApprovals, type ApprovalItem } from "../lib/approvals";
import { postBridgeMessage, isDurableWriteError } from "../lib/company/agentBridge";

const item = { id: "apr-x", type: "IDEA", title: "t", detail: "d", amount: 100, status: "PENDING", createdAt: new Date().toISOString(), metadata: {} } as unknown as ApprovalItem;

describe("bridge durable writes", () => {
  beforeEach(() => { state.failUpsert = false; _clearApprovals(); });
  it("writeApprovalCritical rejects and leaves memory untouched when the DB write fails", async () => {
    state.failUpsert = true;
    await expect(writeApprovalCritical(item)).rejects.toThrow();
    expect(listApprovals().find((a) => a.id === "apr-x")).toBeUndefined();
  });
  it("writeApprovalCritical updates memory only after a successful write", async () => {
    await writeApprovalCritical(item);
    expect(listApprovals().find((a) => a.id === "apr-x")).toBeTruthy();
  });
  it("a failed message insert surfaces as a durable-write error (HTTP 500), not success", async () => {
    state.failUpsert = true;
    const err = await postBridgeMessage("abdulrahman", { direction: "note", body: "hello" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isDurableWriteError(err)).toBe(true);
  });
});
