import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), system: false, role: "OWNER", configured: true }));
vi.mock("../lib/company-os/context", () => ({ requireCompanyContext: async () => ({ ok: true, context: { tenantId: "golden-star", actor: { id: "test-owner", role: boundary.role }, systemCall: boundary.system } }) }));
vi.mock("../lib/supabase", () => ({ getSupabaseAdmin: () => boundary.configured ? { rpc: boundary.rpc } : null }));
import { POST } from "../app/api/tasks/status/route";
const request = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/tasks/status", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.clearAllMocks(); boundary.system = false; boundary.role = "OWNER"; boundary.configured = true; });
describe("human proof API", () => {
  it("refuses an empty proof even from the owner", async () => {
    const response = await POST(request({ id: "task-test", confirmReal: true }));
    expect(response.status).toBe(400); expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("does not let a system key impersonate a human confirmation", async () => {
    boundary.system = true;
    const response = await POST(request({ id: "task-test", confirmReal: true, proofNote: "synthetic sufficient proof text" }));
    expect(response.status).toBe(403); expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("refuses invalid status and progress before touching storage", async () => {
    expect((await POST(request({ id: "task-test", status: "invented", progressPercent: 101 }))).status).toBe(400);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("passes the authenticated tenant and identity to one atomic operation", async () => {
    boundary.rpc.mockResolvedValue({ data: { id: "task-test", status: "DONE" }, error: null });
    const response = await POST(request({ id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح لتأكيد التنفيذ" }));
    expect(response.status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith("orvanta_update_task_status", expect.objectContaining({ p_tenant_id: "golden-star", p_actor: "test-owner", p_confirm_real: true }));
  });
  it("does not acknowledge closure if the atomic audit fails", async () => {
    boundary.rpc.mockResolvedValue({ data: null, error: { message: "audit unavailable" } });
    const response = await POST(request({ id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح لتأكيد التنفيذ" }));
    expect(response.status).toBe(409); expect((await response.json()).ok).toBe(false);
  });
});
