// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseNotConfiguredError, failureStatus } from "@/lib/supabase";

const DATABASE_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

describe("a tool page without a database", () => {
  beforeEach(() => {
    for (const name of DATABASE_ENV) vi.stubEnv(name, "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the missing database in Arabic, and only that failure is a 503", () => {
    const missing = new DatabaseNotConfiguredError("Supabase is required for ZATCA invoices.");
    expect(missing.message).toBe("قاعدة البيانات غير مهيأة على هذه النسخة، فلا يمكن عرض هذه البيانات أو حفظها.");
    expect(missing.detail).toBe("Supabase is required for ZATCA invoices.");
    expect(failureStatus(missing)).toBe(503);
    expect(failureStatus(new Error("connection reset"))).toBe(500);
    expect(failureStatus("not an error")).toBe(500);
  });

  it.each([
    ["sales and customers", () => import("@/app/api/crm-sales/route")],
    ["procurement and inventory", () => import("@/app/api/procurement-inventory/route")],
  ])("answers the %s page with 503 and the Arabic message", async (_page, load) => {
    const { GET } = await load();
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false, error: new DatabaseNotConfiguredError().message });
    expect(JSON.stringify(body)).not.toMatch(/Supabase/);
  });
});
