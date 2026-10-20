import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeProofSupabase } from "./helpers/fakeProofSupabase";

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import("./helpers/fakeProofSupabase").createFakeProofSupabase> | null }));
vi.mock("../lib/supabase", () => ({ getSupabaseAdmin: () => fake.current?.client ?? null, persist: vi.fn() }));
const government = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("../lib/governmentRelationsV2", () => ({ uploadAndAutomateGovernmentDocument: government.upload, GOVERNMENT_MAX_FILE_BYTES: 8 * 1024 * 1024 }));

import { copyProofFileToGovernment, createUploadSlot, findOpenProof, getProof, openProofFile, registerProofFile, removeProofFile, startProof } from "@/lib/executionProofs/store";
import { PROOF_BUCKET } from "@/lib/executionProofs/rules";

const owner = { tenantId: "golden-star", actorId: "owner-1", actorRole: "OWNER", systemCall: false };
const pdfBytes = (marker: string) => new Uint8Array(Buffer.from(`%PDF-1.7\n${marker}`));
const savedEnv = { ...process.env };

function seedTask(id: string, metadata: Record<string, unknown> = { executionKind: "REAL_WORLD" }, status = "IN_PROGRESS", tenant = "golden-star") {
  fake.current!.tables.tasks.push({ id, tenant_id: tenant, status, title: id, metadata });
}

async function attach(proofId: string, bytes: Uint8Array, name = "receipt.pdf") {
  const slot = await createUploadSlot(owner, proofId, { fileName: name, mimeType: "application/pdf", sizeBytes: bytes.length });
  fake.current!.putObject(PROOF_BUCKET, slot.path, bytes);
  return { slot, view: await registerProofFile(owner, proofId, slot.path, name) };
}

beforeEach(() => {
  fake.current = createFakeProofSupabase();
  delete process.env.ORVANTA_PROOF_READING;
  process.env.COMPANY_LEGAL_NAME = "شركة النجمة الذهبية";
});
afterEach(() => { process.env = { ...savedEnv }; vi.restoreAllMocks(); government.upload.mockReset(); });

describe("who may touch a proof", () => {
  it("refuses a system key and any role but owner or admin, before touching the database", async () => {
    seedTask("t1");
    for (const actor of [{ ...owner, systemCall: true }, { ...owner, actorRole: "MANAGER" }, { ...owner, actorRole: "EMPLOYEE" }]) {
      await expect(startProof(actor, "t1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(findOpenProof(actor, "t1")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(openProofFile(actor, "any")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(fake.current!.calls).toEqual([]);
    await expect(startProof({ ...owner, actorRole: "ADMIN" }, "t1")).resolves.toBeTruthy();
  });

  it("answers 503 without a database", async () => {
    fake.current = null;
    await expect(startProof(owner, "t1")).rejects.toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
  });
});

describe("startProof", () => {
  it("opens a draft only for a real-world step of this tenant that is not closed", async () => {
    seedTask("other-tenant", { executionKind: "REAL_WORLD" }, "IN_PROGRESS", "someone-else");
    seedTask("closed", { executionKind: "REAL_WORLD" }, "DONE");
    seedTask("internal", { executionKind: "INTERNAL" });
    seedTask("funded", { requiresFunding: true });
    await expect(startProof(owner, "other-tenant")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(startProof(owner, "closed")).rejects.toMatchObject({ code: "SEALED", status: 409 });
    await expect(startProof(owner, "internal")).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    await expect(startProof(owner, "funded")).resolves.toMatchObject({ taskId: "funded", sealed: false, files: [] });
  });

  // Review Focus 5: closing the tab and coming back resumes the same draft.
  it("resumes the open draft, with its files, instead of opening a second", async () => {
    seedTask("t1");
    const first = await startProof(owner, "t1");
    await attach(first.id, pdfBytes("one"));
    const again = await startProof(owner, "t1");
    expect(again.id).toBe(first.id);
    expect(again.files).toHaveLength(1);
    expect(fake.current!.tables.execution_proofs).toHaveLength(1);
  });
});

describe("findOpenProof", () => {
  // The form shows a returning owner the files already attached, without
  // opening a draft for every step someone merely looks at.
  it("returns the step's open draft and opens none itself", async () => {
    seedTask("t1");
    expect(await findOpenProof(owner, "t1")).toBeNull();
    expect(fake.current!.tables.execution_proofs).toHaveLength(0);
    const proof = await startProof(owner, "t1");
    await attach(proof.id, pdfBytes("left behind"));
    const found = await findOpenProof(owner, "t1");
    expect(found).toMatchObject({ id: proof.id, taskId: "t1", sealed: false });
    expect(found!.files).toHaveLength(1);
    expect(await findOpenProof({ ...owner, tenantId: "someone-else" }, "t1")).toBeNull();
    fake.current!.seal(proof.id);
    expect(await findOpenProof(owner, "t1")).toBeNull();
  });
});

describe("createUploadSlot", () => {
  it("hands out a path inside the proof and keeps the bucket private", async () => {
    seedTask("t1");
    fake.current!.buckets.set(PROOF_BUCKET, { public: true });
    const proof = await startProof(owner, "t1");
    const slot = await createUploadSlot(owner, proof.id, { fileName: "عقد.pdf", mimeType: "application/pdf", sizeBytes: 2048 });
    expect(slot.path.startsWith(`golden-star/t1/${proof.id.toLowerCase()}/`)).toBe(true);
    expect(slot.path.endsWith(".pdf")).toBe(true);
    expect(fake.current!.calls).toContain(`updateBucket:${PROOF_BUCKET}:false`);
  });

  it("refuses a sealed proof, an eleventh file, an oversize or foreign declaration", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    await expect(createUploadSlot(owner, proof.id, { fileName: "big.pdf", mimeType: "application/pdf", sizeBytes: 20 * 1024 * 1024 + 1 })).rejects.toMatchObject({ code: "TOO_LARGE", status: 413 });
    await expect(createUploadSlot(owner, proof.id, { fileName: "a.txt", mimeType: "text/plain", sizeBytes: 10 })).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE", status: 415 });
    for (let page = 0; page < 10; page += 1) await attach(proof.id, pdfBytes(`page ${page}`));
    await expect(createUploadSlot(owner, proof.id, { fileName: "11.pdf", mimeType: "application/pdf", sizeBytes: 10 })).rejects.toMatchObject({ code: "FILE_LIMIT", status: 409 });
    fake.current!.seal(proof.id);
    await expect(createUploadSlot(owner, proof.id, { fileName: "late.pdf", mimeType: "application/pdf", sizeBytes: 10 })).rejects.toMatchObject({ code: "SEALED", status: 409 });
  });

  it("does not find another tenant's proof", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    await expect(createUploadSlot({ ...owner, tenantId: "someone-else" }, proof.id, { fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("registerProofFile", () => {
  it("fingerprints the stored bytes and records the type the bytes are", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const bytes = pdfBytes("registration");
    const { view } = await attach(proof.id, bytes, "السجل التجاري.pdf");
    expect(view.files[0]).toMatchObject({
      fileName: "السجل التجاري.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      reading: { status: "NOT_READ" },
    });
  });

  it("refuses a path outside the proof without downloading it", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    await expect(registerProofFile(owner, proof.id, "golden-star/t1/another-proof/x.pdf", "x.pdf")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fake.current!.calls.some((call) => call.startsWith("download:"))).toBe(false);
  });

  // Review Focus 3: the bytes decide, and a refused object does not stay.
  it("refuses bytes that are not one of the four types, or too large, and removes them", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const html = await createUploadSlot(owner, proof.id, { fileName: "invoice.png", mimeType: "image/png", sizeBytes: 30 });
    fake.current!.putObject(PROOF_BUCKET, html.path, new Uint8Array(Buffer.from("<!doctype html><script>")));
    await expect(registerProofFile(owner, proof.id, html.path, "invoice.png")).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE", status: 415 });
    expect(fake.current!.hasObject(PROOF_BUCKET, html.path)).toBe(false);

    const big = await createUploadSlot(owner, proof.id, { fileName: "scan.pdf", mimeType: "application/pdf", sizeBytes: 100 });
    fake.current!.putObject(PROOF_BUCKET, big.path, new Uint8Array(20 * 1024 * 1024 + 1).fill(0x25));
    await expect(registerProofFile(owner, proof.id, big.path, "scan.pdf")).rejects.toMatchObject({ code: "TOO_LARGE", status: 413 });
    expect(fake.current!.hasObject(PROOF_BUCKET, big.path)).toBe(false);
  });

  // Review Focus 2.
  it("refuses the same file twice in one proof and removes the copy", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    await attach(proof.id, pdfBytes("same"));
    const second = await createUploadSlot(owner, proof.id, { fileName: "copy.pdf", mimeType: "application/pdf", sizeBytes: 10 });
    fake.current!.putObject(PROOF_BUCKET, second.path, pdfBytes("same"));
    await expect(registerProofFile(owner, proof.id, second.path, "copy.pdf")).rejects.toMatchObject({ code: "DUPLICATE_FILE", status: 409 });
    expect(fake.current!.hasObject(PROOF_BUCKET, second.path)).toBe(false);
  });

  // A retried request must never cost the proof its file.
  it("treats a repeated registration of the same upload as done, removing nothing", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const { slot } = await attach(proof.id, pdfBytes("retried"));
    const again = await registerProofFile(owner, proof.id, slot.path, "receipt.pdf");
    expect(again.files).toHaveLength(1);
    expect(fake.current!.calls).not.toContain(`remove:${slot.path}`);
    expect(fake.current!.hasObject(PROOF_BUCKET, slot.path)).toBe(true);
  });

  it("answers 404 when nothing was uploaded to the slot", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const slot = await createUploadSlot(owner, proof.id, { fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 });
    await expect(registerProofFile(owner, proof.id, slot.path, "a.pdf")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("removeProofFile", () => {
  // A wrong attachment must not be sealed into the proof for want of a way out.
  it("takes a file out of a draft, object and all, and leaves the rest", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const wrong = await attach(proof.id, pdfBytes("wrong file"), "خطأ.pdf");
    await attach(proof.id, pdfBytes("right file"), "صحيح.pdf");
    const after = await removeProofFile(owner, wrong.view.files[0].id);
    expect(after.files.map((file) => file.fileName)).toEqual(["صحيح.pdf"]);
    expect(fake.current!.hasObject(PROOF_BUCKET, wrong.slot.path)).toBe(false);
    expect(fake.current!.tables.execution_proofs).toHaveLength(1);
  });

  it("refuses a sealed proof's file, another tenant's file, and anyone but the owner", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const { slot, view } = await attach(proof.id, pdfBytes("sealed"));
    await expect(removeProofFile({ ...owner, actorRole: "EMPLOYEE" }, view.files[0].id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeProofFile({ ...owner, tenantId: "someone-else" }, view.files[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    fake.current!.seal(proof.id);
    await expect(removeProofFile(owner, view.files[0].id)).rejects.toMatchObject({ code: "SEALED", status: 409 });
    expect(fake.current!.tables.execution_proof_files).toHaveLength(1);
    expect(fake.current!.hasObject(PROOF_BUCKET, slot.path)).toBe(true);
  });

  it("keeps the object when the database refuses, as when the proof is sealed meanwhile", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const { slot, view } = await attach(proof.id, pdfBytes("raced"));
    const select = fake.current!.client.from;
    let reads = 0;
    // The confirmation seals the proof between this read and the delete.
    fake.current!.client.from = ((table: string) => {
      if (table === "execution_proofs" && ++reads === 1) queueMicrotask(() => fake.current!.seal(proof.id));
      return select(table);
    }) as typeof select;
    await expect(removeProofFile(owner, view.files[0].id)).rejects.toMatchObject({ code: "SEALED" });
    expect(fake.current!.hasObject(PROOF_BUCKET, slot.path)).toBe(true);
  });
});

describe("getProof", () => {
  it("warns about what disagrees with the company, from the facts the owner sees", async () => {
    seedTask("t1", { executionKind: "REAL_WORLD", requiresFunding: true });
    fake.current!.tables.company_approvals.push(
      { id: "a1", tenant_id: "golden-star", type: "BUDGET", status: "APPROVED", amount: 4500, metadata: { taskId: "t1", kind: "TASK_FUNDING" } },
      { id: "a2", tenant_id: "golden-star", type: "BUDGET", status: "PENDING", amount: 9000, metadata: { taskId: "t1", kind: "TASK_FUNDING" } }
    );
    const proof = await startProof(owner, "t1");
    const sealedFacts = { parties: "مؤسسة أخرى", amount: "5000", expiryDate: "2020-01-01" };
    fake.current!.seal(proof.id);
    fake.current!.tables.execution_proofs[0].facts_attested = sealedFacts;
    const view = await getProof(owner, proof.id);
    expect(view.sealed).toBe(true);
    expect(view.attested).toEqual(sealedFacts);
    expect(view.flags.map((flag) => flag.code).sort()).toEqual(["AMOUNT_DIFFERS", "EXPIRED", "HOLDER_NOT_COMPANY"]);
  });
});

describe("openProofFile", () => {
  it("signs a 60-second link only for a file of this tenant", async () => {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const { view } = await attach(proof.id, pdfBytes("open"));
    const opened = await openProofFile(owner, view.files[0].id);
    expect(opened.expiresInSeconds).toBe(60);
    expect(fake.current!.calls).toContain(`signedUrl:${fake.current!.tables.execution_proof_files[0].storage_path}:60`);
    await expect(openProofFile({ ...owner, tenantId: "someone-else" }, view.files[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("copyProofFileToGovernment", () => {
  const readAs = (reading: Record<string, unknown>) => {
    process.env.ORVANTA_PROOF_READING = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ output_text: JSON.stringify(reading) }), { status: 200 }));
  };
  const registration = { documentKind: { value: "سجل تجاري", confidence: 0.92 }, issuer: { value: "وزارة التجارة", confidence: 0.9 }, governmentType: "COMMERCIAL_REGISTRATION" };

  async function sealedProofWith(bytes: Uint8Array, attested: Record<string, string> = { issuer: "وزارة التجارة", documentKind: "سجل تجاري" }) {
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const { view } = await attach(proof.id, bytes, "السجل التجاري.pdf");
    fake.current!.seal(proof.id);
    fake.current!.tables.execution_proofs[0].facts_attested = attested;
    return { proof, file: view.files[0] };
  }

  it("hands a sealed proof's government document over with its own bytes and the attested issuer", async () => {
    readAs(registration);
    const bytes = pdfBytes("registration certificate");
    const { file } = await sealedProofWith(bytes);
    government.upload.mockResolvedValue({ document: { id: "gov-1" } });
    await expect(copyProofFileToGovernment(owner, file.id)).resolves.toEqual({ documentId: "gov-1", alreadyTracked: false });
    expect(government.upload).toHaveBeenCalledWith(
      { tenantId: "golden-star", actorId: "owner-1", actorRole: "OWNER" },
      expect.objectContaining({
        documentType: "COMMERCIAL_REGISTRATION",
        issuer: "وزارة التجارة",
        fileName: "السجل التجاري.pdf",
        mimeType: "application/pdf",
        fileBase64: Buffer.from(bytes).toString("base64"),
      })
    );
    const calls = fake.current!.calls;
    expect(calls.some((call) => /^(update|delete):/.test(call))).toBe(false);
    expect(calls.some((call) => call.startsWith("remove:"))).toBe(false);
    expect(fake.current!.hasObject(PROOF_BUCKET, fake.current!.tables.execution_proof_files[0].storage_path)).toBe(true);
  });

  it("refuses a draft, a file nobody read, and a reading unsure of the document's kind", async () => {
    readAs(registration);
    seedTask("draft");
    const draft = await startProof(owner, "draft");
    const { view } = await attach(draft.id, pdfBytes("draft"));
    await expect(copyProofFileToGovernment(owner, view.files[0].id)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });

    readAs({ ...registration, documentKind: { value: "سجل تجاري", confidence: 0.5 } });
    const unsure = await sealedProofWith(pdfBytes("unsure"));
    await expect(copyProofFileToGovernment(owner, unsure.file.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });

    delete process.env.ORVANTA_PROOF_READING;
    fake.current = createFakeProofSupabase();
    const unread = await sealedProofWith(pdfBytes("unread"));
    expect(unread.file.reading.status).toBe("NOT_READ");
    await expect(copyProofFileToGovernment(owner, unread.file.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(government.upload).not.toHaveBeenCalled();
  });

  it("does not hand the same document over twice", async () => {
    readAs(registration);
    const { file } = await sealedProofWith(pdfBytes("tracked already"));
    fake.current!.tables.gov_document_files.push({ id: "gf-1", tenant_id: "golden-star", document_id: "gov-existing", content_hash: file.sha256 });
    await expect(copyProofFileToGovernment(owner, file.id)).resolves.toEqual({ documentId: "gov-existing", alreadyTracked: true });
    expect(government.upload).not.toHaveBeenCalled();
  });

  it("refuses a file above the Government Relations limit before downloading it", async () => {
    readAs(registration);
    const bytes = new Uint8Array(8 * 1024 * 1024 + 1);
    bytes.set(pdfBytes("large scan"));
    const { file } = await sealedProofWith(bytes);
    const downloads = fake.current!.calls.filter((call) => call.startsWith("download:")).length;
    await expect(copyProofFileToGovernment(owner, file.id)).rejects.toMatchObject({ code: "TOO_LARGE", status: 413 });
    expect(fake.current!.calls.filter((call) => call.startsWith("download:"))).toHaveLength(downloads);
  });

  it("surfaces a Government Relations refusal in its own words, hides an internal one, and keeps the proof", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    readAs(registration);
    const { file } = await sealedProofWith(pdfBytes("refused"));
    government.upload.mockRejectedValueOnce(new Error("نوع الملف غير مدعوم. استخدم PDF أو صورة أو ملفاً نصياً."));
    await expect(copyProofFileToGovernment(owner, file.id)).rejects.toMatchObject({ code: "GOVERNMENT_FAILED", message: "نوع الملف غير مدعوم. استخدم PDF أو صورة أو ملفاً نصياً." });
    government.upload.mockRejectedValueOnce({ message: "insert or update on table gov_documents violates foreign key constraint" });
    const hidden = await copyProofFileToGovernment(owner, file.id).catch((error) => error);
    expect(hidden).toMatchObject({ code: "GOVERNMENT_FAILED", status: 503 });
    expect(hidden.message).not.toContain("gov_documents");
    expect(fake.current!.calls.some((call) => /^(update|delete):|^remove:/.test(call))).toBe(false);
    expect(fake.current!.tables.execution_proofs[0].confirmed_at).toBeTruthy();
  });
});

describe("what the store never does", () => {
  it("never closes a task, and never changes or removes what a proof holds", async () => {
    process.env.ORVANTA_PROOF_READING = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: "{\"reference\":{\"value\":\"1010\",\"confidence\":0.9}}" }), { status: 200 }));
    seedTask("t1");
    const proof = await startProof(owner, "t1");
    const { view } = await attach(proof.id, pdfBytes("kept"));
    expect(view.files[0].reading.status).toBe("READ");
    await getProof(owner, proof.id);
    await openProofFile(owner, view.files[0].id);
    const calls = fake.current!.calls;
    expect(calls.some((call) => call.startsWith("rpc:"))).toBe(false); // anti-goal 2: reading never confirms
    expect(calls.some((call) => /^(update|delete):/.test(call))).toBe(false);
    const kept = fake.current!.tables.execution_proof_files[0].storage_path;
    expect(calls).not.toContain(`remove:${kept}`); // anti-goal 3
    expect(fake.current!.hasObject(PROOF_BUCKET, kept)).toBe(true);
  });
});
