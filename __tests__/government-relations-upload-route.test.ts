// @vitest-environment node
// The route parses multipart bodies with Node's own File, as it does in production.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const v2 = vi.hoisted(() => ({
  createGovernmentUploadSlot: vi.fn(),
  uploadAndAutomateGovernmentDocument: vi.fn(),
  getGovernmentRelationsDashboard: vi.fn(),
  reanalyzeGovernmentDocument: vi.fn(),
  createGovernmentFilePreview: vi.fn(),
  assertGovernmentEntityTenant: vi.fn(),
}));
vi.mock("../lib/company-os/context", () => ({
  requireCompanyContext: async () => ({ ok: true, context: { tenantId: "golden-star", actor: { id: "owner-1", role: "OWNER", name: "المالك" }, requestId: "req-1", correlationId: "corr-1" } }),
}));
vi.mock("../lib/governmentRelations", () => ({
  addGovernmentRegulatorySource: vi.fn(), createGovernmentRenewalPlan: vi.fn(), deleteGovernmentDocument: vi.fn(), prepareDigitalRenewal: vi.fn(),
  refreshGovernmentFees: vi.fn(), refreshGovernmentRegulations: vi.fn(), reviewGovernmentRegulatoryUpdate: vi.fn(), seedGovernmentRelationsOS: vi.fn(),
  syncGovernmentDocumentCompliance: vi.fn(), updateGovernmentDocument: vi.fn(), updateGovernmentRenewalTask: vi.fn(),
}));
vi.mock("../lib/governmentRelationsV2", () => v2);

import { POST } from "../app/api/government-relations/route";
import { ProofError } from "../lib/executionProofs/rules";

const context = { tenantId: "golden-star", actorId: "owner-1", actorRole: "OWNER", actorName: "المالك", correlationId: "corr-1" };
const json = (body: unknown) => POST(new NextRequest("http://localhost/api/government-relations", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => vi.clearAllMocks());

describe("government document uploads", () => {
  it("hands out an upload slot for the declared file", async () => {
    v2.createGovernmentUploadSlot.mockResolvedValue({ path: "golden-star/incoming/x.pdf", signedUrl: "https://storage.test/upload?token=t" });
    const response = await json({ action: "upload-slot", data: { fileName: "السجل.pdf", mimeType: "application/pdf", sizeBytes: 12_582_912 } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, result: { path: "golden-star/incoming/x.pdf", signedUrl: "https://storage.test/upload?token=t" } });
    expect(v2.createGovernmentUploadSlot).toHaveBeenCalledWith(context, { fileName: "السجل.pdf", mimeType: "application/pdf", sizeBytes: 12_582_912 });
  });

  it("answers a refused declaration with its own status and words", async () => {
    v2.createGovernmentUploadSlot.mockRejectedValue(new ProofError("UNSUPPORTED_TYPE", 415, "المقبول: PDF أو صورة JPEG أو PNG أو WEBP."));
    const response = await json({ action: "upload-slot", data: { fileName: "a.docx", mimeType: "application/msword", sizeBytes: 10 } });
    expect(response.status).toBe(415);
    expect((await response.json()).error).toBe("المقبول: PDF أو صورة JPEG أو PNG أو WEBP.");
  });

  it("registers an uploaded document by its storage path, carrying no file in the request", async () => {
    v2.uploadAndAutomateGovernmentDocument.mockResolvedValue({ document: { id: "gov-1" } });
    const response = await json({ action: "upload-document", data: { storagePath: "golden-star/incoming/x.pdf", fileName: "السجل.pdf", mimeType: "application/pdf", documentType: "COMMERCIAL_REGISTRATION", title: "", issuer: "وزارة التجارة", notes: "" } });
    expect(response.status).toBe(201);
    const input = v2.uploadAndAutomateGovernmentDocument.mock.calls[0][1];
    expect(input).toMatchObject({ storagePath: "golden-star/incoming/x.pdf", fileName: "السجل.pdf", documentType: "COMMERCIAL_REGISTRATION", issuer: "وزارة التجارة" });
    expect(input).not.toHaveProperty("fileBase64");
  });

  it("keeps the multipart form working for a small file", async () => {
    v2.uploadAndAutomateGovernmentDocument.mockResolvedValue({ document: { id: "gov-2" } });
    const form = new FormData();
    form.set("action", "upload-document");
    form.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "notes.pdf", { type: "application/pdf" }));
    const response = await POST(new NextRequest("http://localhost/api/government-relations", { method: "POST", body: form }));
    expect(response.status).toBe(201);
    expect(v2.uploadAndAutomateGovernmentDocument.mock.calls[0][1]).toMatchObject({ fileName: "notes.pdf", fileBase64: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]).toString("base64") });
  });
});
