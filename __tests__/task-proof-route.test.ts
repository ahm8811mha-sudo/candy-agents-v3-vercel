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
  it("keeps a text-only confirmation exactly as before: no proof arguments at all", async () => {
    boundary.rpc.mockResolvedValue({ data: { id: "task-test", status: "DONE" }, error: null });
    await POST(request({ id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح لتأكيد التنفيذ" }));
    const args = boundary.rpc.mock.calls[0][1];
    expect(args).not.toHaveProperty("p_proof_id");
    expect(args).not.toHaveProperty("p_attested_facts");
  });
  it("passes the proof and the facts the owner attested to the same atomic call", async () => {
    boundary.rpc.mockResolvedValue({ data: { id: "task-test", status: "DONE" }, error: null });
    const response = await POST(request({ id: "task-test", confirmReal: true, proofNote: "صدر السجل والمستندات مرفقة", proofId: "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e", attestedFacts: { reference: " 1010 ", issuer: "وزارة التجارة" } }));
    expect(response.status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith("orvanta_update_task_status", expect.objectContaining({
      p_proof_id: "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e",
      p_attested_facts: { reference: "1010", issuer: "وزارة التجارة" },
    }));
  });
  it("refuses attested facts without a proof, a proof without a confirmation, and unknown facts", async () => {
    const proofId = "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e";
    expect((await POST(request({ id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح للتأكيد", attestedFacts: { reference: "1" } }))).status).toBe(400);
    expect((await POST(request({ id: "task-test", status: "IN_PROGRESS", proofId }))).status).toBe(400);
    expect((await POST(request({ id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح للتأكيد", proofId, attestedFacts: { nationalId: "1" } }))).status).toBe(400);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("answers a second press on a sealed proof with 409 and leaves the step as it is", async () => {
    boundary.rpc.mockResolvedValue({ data: null, error: { message: "PROOF_ALREADY_SEALED" } });
    const response = await POST(request({ id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح للتأكيد", proofId: "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e" }));
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("خُتم");
  });
  it("maps a missing proof to 404 and a proof without files to 400", async () => {
    const body = { id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح للتأكيد", proofId: "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e" };
    boundary.rpc.mockResolvedValueOnce({ data: null, error: { message: "PROOF_NOT_FOUND" } });
    expect((await POST(request(body))).status).toBe(404);
    boundary.rpc.mockResolvedValueOnce({ data: null, error: { message: "PROOF_HAS_NO_FILES" } });
    expect((await POST(request(body))).status).toBe(400);
  });
  it("does not acknowledge closure if the atomic audit fails", async () => {
    boundary.rpc.mockResolvedValue({ data: null, error: { message: "audit unavailable" } });
    const response = await POST(request({ id: "task-test", confirmReal: true, proofNote: "مرجع اختبار واضح لتأكيد التنفيذ" }));
    expect(response.status).toBe(409); expect((await response.json()).ok).toBe(false);
  });
});
