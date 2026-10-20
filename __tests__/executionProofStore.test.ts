import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeProofSupabase } from "./helpers/fakeProofSupabase";

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import("./helpers/fakeProofSupabase").createFakeProofSupabase> | null }));
vi.mock("../lib/supabase", () => ({ getSupabaseAdmin: () => fake.current?.client ?? null, persist: vi.fn() }));

import { createUploadSlot, getProof, openProofFile, registerProofFile, startProof } from "@/lib/executionProofs/store";
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
afterEach(() => { process.env = { ...savedEnv }; vi.restoreAllMocks(); });

describe("who may touch a proof", () => {
  it("refuses a system key and any role but owner or admin, before touching the database", async () => {
    seedTask("t1");
    for (const actor of [{ ...owner, systemCall: true }, { ...owner, actorRole: "MANAGER" }, { ...owner, actorRole: "EMPLOYEE" }]) {
      await expect(startProof(actor, "t1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
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
