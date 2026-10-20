import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const boundary = vi.hoisted(() => ({ authenticated: true, system: false, role: "OWNER" }));
const store = vi.hoisted(() => ({ startProof: vi.fn(), createUploadSlot: vi.fn(), registerProofFile: vi.fn(), getProof: vi.fn(), openProofFile: vi.fn() }));
vi.mock("../lib/company-os/context", () => ({
  requireCompanyContext: async () => boundary.authenticated
    ? { ok: true, context: { tenantId: "golden-star", actor: { id: "owner-1", role: boundary.role }, systemCall: boundary.system } }
    : { ok: false, response: NextResponse.json({ ok: false, code: "AUTH_REQUIRED" }, { status: 401 }) },
}));
vi.mock("../lib/executionProofs/store", () => store);

import { GET, POST } from "../app/api/tasks/proof/route";
import { ProofError } from "../lib/executionProofs/rules";

const PROOF = "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e";
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/tasks/proof", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const actor = { tenantId: "golden-star", actorId: "owner-1", actorRole: "OWNER", systemCall: false };

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(boundary, { authenticated: true, system: false, role: "OWNER" });
});

describe("execution proof API", () => {
  it("returns the context's own refusal when not signed in", async () => {
    boundary.authenticated = false;
    expect((await post({ action: "start", taskId: "t1" })).status).toBe(401);
    expect(store.startProof).not.toHaveBeenCalled();
  });

  it("refuses a malformed request before the store", async () => {
    for (const body of [{ action: "delete-everything" }, { action: "slot", proofId: PROOF, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1.5 }, { action: "register", proofId: "not-a-uuid", path: "x", fileName: "a" }, null]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(Object.values(store).some((fn) => fn.mock.calls.length > 0)).toBe(false);
  });

  it("passes the authenticated tenant and person to each action", async () => {
    store.startProof.mockResolvedValue({ id: PROOF });
    store.createUploadSlot.mockResolvedValue({ path: "p", token: "t", signedUrl: "https://s" });
    store.registerProofFile.mockResolvedValue({ id: PROOF, files: [] });
    store.openProofFile.mockResolvedValue({ url: "https://signed", expiresInSeconds: 60 });
    expect((await post({ action: "start", taskId: "t1" })).status).toBe(200);
    expect(store.startProof).toHaveBeenCalledWith(actor, "t1");
    await post({ action: "slot", proofId: PROOF, fileName: "عقد.pdf", mimeType: "application/pdf", sizeBytes: 2048 });
    expect(store.createUploadSlot).toHaveBeenCalledWith(actor, PROOF, { fileName: "عقد.pdf", mimeType: "application/pdf", sizeBytes: 2048 });
    await post({ action: "register", proofId: PROOF, path: "golden-star/t1/x/y.pdf", fileName: "عقد.pdf" });
    expect(store.registerProofFile).toHaveBeenCalledWith(actor, PROOF, "golden-star/t1/x/y.pdf", "عقد.pdf");
    const opened = await (await post({ action: "open", fileId: PROOF })).json();
    expect(opened).toEqual({ ok: true, url: "https://signed", expiresInSeconds: 60 });
  });

  it("passes a system key through as such; the store refuses it", async () => {
    boundary.system = true;
    store.startProof.mockRejectedValue(new ProofError("FORBIDDEN", 403, "للمالك فقط"));
    const response = await post({ action: "start", taskId: "t1" });
    expect(response.status).toBe(403);
    expect(store.startProof).toHaveBeenCalledWith({ ...actor, systemCall: true }, "t1");
  });

  it("answers a refusal with its own status and Arabic message", async () => {
    store.createUploadSlot.mockRejectedValue(new ProofError("SEALED", 409, "هذا الإثبات مختوم ولا يقبل ملفات جديدة."));
    const response = await post({ action: "slot", proofId: PROOF, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "SEALED", message: "هذا الإثبات مختوم ولا يقبل ملفات جديدة." });
  });

  it("hides an unexpected failure behind a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    store.getProof.mockRejectedValue(new Error("connection reset by peer at 10.0.0.3"));
    const response = await GET(new NextRequest(`http://localhost/api/tasks/proof?proofId=${PROOF}`));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("10.0.0.3");
    expect(body.ok).toBe(false);
  });

  it("reads a proof by id", async () => {
    store.getProof.mockResolvedValue({ id: PROOF, sealed: true });
    const response = await GET(new NextRequest(`http://localhost/api/tasks/proof?proofId=${PROOF}`));
    expect(await response.json()).toEqual({ ok: true, proof: { id: PROOF, sealed: true } });
    expect((await GET(new NextRequest("http://localhost/api/tasks/proof?proofId=x"))).status).toBe(400);
  });
});
