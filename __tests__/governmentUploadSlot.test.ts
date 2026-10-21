import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Supabase Storage's own rule for an object key (supabase/storage,
// src/storage/limits.ts, VALID_OBJECT_KEY): ASCII only. A key outside it is
// refused with "Invalid key".
const VALID_OBJECT_KEY = /^[A-Za-z0-9_/!.*'() &$=@;:+,?-]*$/;

type Row = Record<string, any>;

function createFakeGovernment() {
  const rows: Record<string, Row[]> = {};
  const objects = new Map<string, Uint8Array>();
  const buckets = new Map<string, Row>();
  const calls: string[] = [];
  let sequence = 0;
  function from(table: string) {
    rows[table] ??= [];
    let mode: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let payload: Row | null = null;
    const filters: Array<[string, unknown]> = [];
    const matching = () => rows[table].filter((row) => filters.every(([column, value]) => row[column] === value));
    const run = () => {
      if (mode === "insert") {
        const row = { id: `${table}-${++sequence}`, created_at: new Date().toISOString(), ...payload };
        rows[table].push(row);
        calls.push(`insert:${table}`);
        return { data: row, error: null };
      }
      if (mode === "upsert") { calls.push(`upsert:${table}`); rows[table].push({ ...payload }); return { data: payload, error: null }; }
      if (mode === "update") { calls.push(`update:${table}`); const found = matching(); found.forEach((row) => Object.assign(row, payload)); return { data: found[0] ?? null, error: null }; }
      if (mode === "delete") { calls.push(`delete:${table}`); const doomed = matching(); rows[table] = rows[table].filter((row) => !doomed.includes(row)); return { data: null, error: null }; }
      return { data: matching().map((row) => ({ ...row })), error: null };
    };
    const builder: any = {
      select() { return builder; },
      insert(value: Row) { mode = "insert"; payload = value; return builder; },
      upsert(value: Row) { mode = "upsert"; payload = value; return builder; },
      update(value: Row) { mode = "update"; payload = value; return builder; },
      delete() { mode = "delete"; return builder; },
      eq(column: string, value: unknown) { filters.push([column, value]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      async maybeSingle() { const result = run(); return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null }; },
      async single() { const result = run(); return { data: Array.isArray(result.data) ? result.data[0] : result.data, error: null }; },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  }
  const storage = {
    async getBucket(id: string) { const bucket = buckets.get(id); return bucket ? { data: { id, ...bucket }, error: null } : { data: null, error: { message: "Bucket not found" } }; },
    async createBucket(id: string, options: Row) { calls.push(`createBucket:${id}:${options.fileSizeLimit}:${options.public}`); buckets.set(id, { public: options.public, file_size_limit: options.fileSizeLimit }); return { data: { name: id }, error: null }; },
    async updateBucket(id: string, options: Row) { calls.push(`updateBucket:${id}:${options.fileSizeLimit}:${options.public}`); buckets.set(id, { public: options.public, file_size_limit: options.fileSizeLimit }); return { data: null, error: null }; },
    from(bucket: string) {
      return {
        async createSignedUploadUrl(path: string) { calls.push(`slot:${bucket}/${path}`); return { data: { path, token: "t", signedUrl: `https://storage.test/object/upload/sign/${bucket}/${path}?token=t` }, error: null }; },
        async upload(path: string, body: Uint8Array) {
          calls.push(`upload:${bucket}/${path}`);
          if (!VALID_OBJECT_KEY.test(path)) return { data: null, error: { statusCode: "400", error: "InvalidKey", message: `Invalid key: ${path}` } };
          objects.set(`${bucket}/${path}`, new Uint8Array(body));
          return { data: { path }, error: null };
        },
        async download(path: string) { calls.push(`download:${bucket}/${path}`); const bytes = objects.get(`${bucket}/${path}`); return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { message: "Object not found" } }; },
        async remove(paths: string[]) { for (const path of paths) { calls.push(`remove:${bucket}/${path}`); objects.delete(`${bucket}/${path}`); } return { data: [], error: null }; },
      };
    },
  };
  return { client: { from, storage }, rows, objects, buckets, calls };
}

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createFakeGovernment> | null }));
vi.mock("../lib/supabase", () => ({ getSupabaseAdmin: () => fake.current?.client ?? null, persist: vi.fn() }));
vi.mock("../lib/company-os/events", () => ({ createCompanyEvent: vi.fn(() => ({})) }));
vi.mock("../lib/company-os/outboxPublisher", () => ({ appendCompanyEvent: vi.fn() }));

import { createGovernmentUploadSlot, GOVERNMENT_MAX_FILE_BYTES, uploadAndAutomateGovernmentDocument } from "@/lib/governmentRelationsV2";

const context = { tenantId: "golden-star", actorId: "owner-1", actorRole: "OWNER" };
const pdf = (size: number) => { const bytes = new Uint8Array(size).fill(0x20); bytes.set(Buffer.from("%PDF-1.7\n")); return bytes; };
const savedKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  fake.current = createFakeGovernment();
  delete process.env.OPENAI_API_KEY; // the rules fallback: no document leaves the test
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
});

describe("storage keys", () => {
  // Every Arabic file name failed here: the key kept its Arabic letters, Storage
  // refused it as an invalid key, and the owner saw a save failure after the
  // document had already been sent for analysis.
  it("keeps every key ASCII, so a document named in Arabic is stored, under its own name", async () => {
    const result = await uploadAndAutomateGovernmentDocument(context, {
      fileName: "السجل التجاري.pdf",
      mimeType: "application/pdf",
      fileBase64: Buffer.from(pdf(2048)).toString("base64"),
    });
    const stored = fake.current!.rows.gov_document_files[0];
    expect(VALID_OBJECT_KEY.test(stored.storage_path)).toBe(true);
    expect(stored.storage_path.startsWith(`golden-star/${result.document.id}/`)).toBe(true);
    expect(stored.storage_path.endsWith(".pdf")).toBe(true);
    expect(stored.file_name).toBe("السجل التجاري.pdf");
  });
});

describe("createGovernmentUploadSlot", () => {
  it("hands out a slot inside the tenant's incoming folder, for a document of up to 20 MB", async () => {
    const slot = await createGovernmentUploadSlot(context, { fileName: "عقد التأسيس.pdf", mimeType: "application/pdf", sizeBytes: 12 * 1024 * 1024 });
    expect(slot.path).toMatch(/^golden-star\/incoming\/[0-9a-f-]{36}\.pdf$/);
    expect(fake.current!.calls).toContain(`slot:government-documents/${slot.path}`);
    expect(GOVERNMENT_MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
  });

  it("refuses a type that is not a PDF or an image, and a file over 20 MB, before any slot", async () => {
    await expect(createGovernmentUploadSlot(context, { fileName: "notes.txt", mimeType: "text/plain", sizeBytes: 100 })).rejects.toMatchObject({ status: 415 });
    await expect(createGovernmentUploadSlot(context, { fileName: "scan.pdf", mimeType: "application/pdf", sizeBytes: 20 * 1024 * 1024 + 1 })).rejects.toMatchObject({ status: 413 });
    expect(fake.current!.calls.some((call) => call.startsWith("slot:"))).toBe(false);
  });

  it("lifts a bucket still capped at the old 8 MB, and keeps it private", async () => {
    fake.current!.buckets.set("government-documents", { public: true, file_size_limit: 8 * 1024 * 1024 });
    await createGovernmentUploadSlot(context, { fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 });
    expect(fake.current!.calls).toContain(`updateBucket:government-documents:${20 * 1024 * 1024}:false`);
  });
});

describe("registering an upload by its storage path", () => {
  it("processes a 12 MB PDF from its slot and clears the incoming copy", async () => {
    const slot = await createGovernmentUploadSlot(context, { fileName: "السجل.pdf", mimeType: "application/pdf", sizeBytes: 12 * 1024 * 1024 });
    fake.current!.objects.set(`government-documents/${slot.path}`, pdf(12 * 1024 * 1024));
    const result = await uploadAndAutomateGovernmentDocument(context, { storagePath: slot.path, fileName: "السجل.pdf", mimeType: "application/pdf" });
    const stored = fake.current!.rows.gov_document_files[0];
    expect(result.document.id).toBeTruthy();
    expect(stored.file_size).toBe(12 * 1024 * 1024);
    expect(stored.mime_type).toBe("application/pdf");
    expect(fake.current!.objects.has(`government-documents/${slot.path}`)).toBe(false);
    expect(fake.current!.objects.has(`government-documents/${stored.storage_path}`)).toBe(true);
  });

  it("refuses another tenant's path, or one outside the incoming folder, without downloading it", async () => {
    for (const storagePath of ["someone-else/incoming/7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e.pdf", "golden-star/doc-1/7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e.pdf", "golden-star/incoming/../doc-1/x.pdf"]) {
      await expect(uploadAndAutomateGovernmentDocument(context, { storagePath, fileName: "a.pdf", mimeType: "application/pdf" })).rejects.toThrow();
    }
    expect(fake.current!.calls.some((call) => call.startsWith("download:"))).toBe(false);
  });

  it("refuses bytes that are not a PDF or an image, whatever was declared, and removes them", async () => {
    const slot = await createGovernmentUploadSlot(context, { fileName: "invoice.png", mimeType: "image/png", sizeBytes: 30 });
    fake.current!.objects.set(`government-documents/${slot.path}`, new Uint8Array(Buffer.from("<!doctype html><script>")));
    await expect(uploadAndAutomateGovernmentDocument(context, { storagePath: slot.path, fileName: "invoice.png", mimeType: "image/png" })).rejects.toThrow(/PDF/);
    expect(fake.current!.objects.has(`government-documents/${slot.path}`)).toBe(false);
    expect(fake.current!.rows.gov_documents ?? []).toHaveLength(0);
  });

  it("keeps the small inline path working as before", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const result = await uploadAndAutomateGovernmentDocument(context, { fileName: "receipt.png", mimeType: "image/png", fileBase64: Buffer.from(png).toString("base64") });
    expect(result.document.id).toBeTruthy();
    expect(fake.current!.rows.gov_document_files[0].file_size).toBe(png.length);
  });
});
