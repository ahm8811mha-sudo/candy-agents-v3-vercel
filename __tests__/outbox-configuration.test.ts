import { afterEach, describe, expect, it, vi } from "vitest";
import { outboxConfiguration } from "../lib/company-os/outboxConfiguration";

const mocks = vi.hoisted(() => ({ from: vi.fn(), execute: vi.fn() }));
vi.mock("../lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock("../lib/operations/integrationExecution", () => ({ executeIntegrationOnce: mocks.execute }));
import { publishOutboxBatch } from "../lib/company-os/outboxPublisher";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const configured = { ORVANTA_OUTBOX_ENABLED: "true", CRON_SECRET: "test-scheduler-secret", ORVANTA_WEBHOOK_URL: "https://example.com/events", ORVANTA_WEBHOOK_SECRET: "test-signing-secret" };

describe("outbox delivery configuration", () => {
  it("does not claim readiness for a flag and scheduler without a destination", () => {
    const result = outboxConfiguration({ ORVANTA_OUTBOX_ENABLED: "true", CRON_SECRET: "test" });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("ORVANTA_WEBHOOK_URL");
  });
  it.each(["http://example.com", "https://user:password@example.com", "invalid"])("refuses an invalid or insecure destination: %s", (url) => {
    expect(outboxConfiguration({ ...configured, ORVANTA_WEBHOOK_URL: url }).ready).toBe(false);
  });
  it("requires signed delivery and accepts the existing signing-key fallback", () => {
    expect(outboxConfiguration({ ...configured, ORVANTA_WEBHOOK_SECRET: "" }).ready).toBe(false);
    expect(outboxConfiguration({ ...configured, ORVANTA_WEBHOOK_SECRET: "", API_SECRET_KEY: "test-fallback" }).ready).toBe(true);
  });
  it("leaves pending events and integration receipts untouched when configuration is missing", async () => {
    Object.entries(configured).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.stubEnv("ORVANTA_WEBHOOK_URL", "");
    await expect(publishOutboxBatch({ tenantId: "golden-star" })).rejects.toThrow("No events were claimed");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([true, false])("counts only acknowledged external deliveries (legacy skipped=%s)", async (skipped) => {
    Object.entries(configured).forEach(([key, value]) => vi.stubEnv(key, value));
    const row = { id: "fixture-event", tenant_id: "golden-star", attempts: 0 };
    function query(result: unknown) {
      const pending = Promise.resolve(result);
      return { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), maybeSingle: () => pending, then: pending.then.bind(pending) };
    }
    const read = query({ data: [row], error: null });
    const claim = query({ data: row, error: null });
    const write = query({ error: null });
    mocks.from.mockReturnValueOnce(read).mockReturnValueOnce(claim).mockReturnValueOnce(write);
    mocks.execute.mockResolvedValueOnce({ value: { skipped, responseStatus: 204 }, attemptId: "fixture-attempt", receiptId: "fixture-receipt" });
    const result = await publishOutboxBatch({ tenantId: "golden-star" });
    expect(result.published).toBe(skipped ? 0 : 1);
    expect(result.retried).toBe(skipped ? 1 : 0);
    expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: skipped ? "RETRY" : "PUBLISHED" }));
  });
});
