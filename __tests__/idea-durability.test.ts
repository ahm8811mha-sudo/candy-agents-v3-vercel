import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), range: vi.fn() };
  return { query, from: vi.fn(() => query), rpc: vi.fn() };
});
vi.mock("../lib/supabase", () => ({ getSupabaseAdmin: () => database, hasSupabaseEnv: () => true, persist: vi.fn(), persistCritical: vi.fn() }));
import { _clearIdeas, getIdeaCritical, listIdeas, readIdeasCritical, submitIdeaCritical, updateIdeaStudyCritical } from "../lib/company/ideas";
import { completeStudy } from "./fixtures/idea-study";

const row = { id: "idea-test", tenant_id: "golden-star", title: "اختبار الحفظ", hypothesis: "فرضية اختبار موثقة", budget_sar: 5000, horizon_days: 14, status: "UNDER_STUDY", source: "OWNER", created_at: "2026-09-07T00:00:00Z", revision: 3, recommendations: [] };
beforeEach(() => {
  vi.clearAllMocks(); _clearIdeas();
  database.query.select.mockReturnValue(database.query); database.query.eq.mockReturnValue(database.query); database.query.order.mockReturnValue(database.query);
});
describe("durable idea boundary", () => {
  it("does not add an idea to the snapshot when its transaction fails", async () => {
    database.rpc.mockResolvedValue({ data: null, error: { message: "audit write failed" } });
    await expect(submitIdeaCritical({ title: "اختبار", hypothesis: "فرضية تحتاج دليلاً", budgetSAR: 5000, horizonDays: 14 })).rejects.toThrow("audit write failed");
    expect(listIdeas()).toHaveLength(0);
  });
  it("only acknowledges the row returned by the database", async () => {
    database.rpc.mockResolvedValue({ data: { idea: row }, error: null });
    const saved = await submitIdeaCritical({ title: "اختبار", hypothesis: "فرضية تحتاج دليلاً", budgetSAR: 5000, horizonDays: 14 });
    expect(saved.id).toBe(row.id); expect(saved.revision).toBe(3);
    expect(database.rpc).toHaveBeenCalledWith("orvanta_save_idea", expect.objectContaining({ p_tenant_id: "golden-star", p_expected_revision: null }));
  });
  it("reads an individual idea again instead of trusting process memory", async () => {
    database.query.maybeSingle.mockResolvedValueOnce({ data: row, error: null }).mockResolvedValueOnce({ data: { ...row, revision: 4, status: "REJECTED" }, error: null });
    expect((await getIdeaCritical(row.id))?.status).toBe("UNDER_STUDY");
    expect((await getIdeaCritical(row.id))?.status).toBe("REJECTED");
    expect(database.from).toHaveBeenCalledTimes(2);
  });
  it("rejects an editor opened before another revision was committed", async () => {
    database.query.maybeSingle.mockResolvedValue({ data: row, error: null });
    await expect(updateIdeaStudyCritical(row.id, completeStudy, "golden-star", "owner", 5000, 2)).rejects.toThrow("تغيرت الدراسة");
    expect(database.rpc).not.toHaveBeenCalled();
  });
  it("surfaces a read failure instead of returning an empty company", async () => {
    database.query.range.mockResolvedValue({ data: null, error: { message: "connection lost" } });
    await expect(readIdeasCritical()).rejects.toThrow("connection lost");
  });
});
