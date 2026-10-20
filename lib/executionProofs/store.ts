/**
 * Execution proofs on the server: drafts, upload slots, registration, views
 * and short-lived links.
 *
 * Files travel from the browser straight to a private bucket through a signed
 * upload URL; this module then downloads each one, checks its real type and
 * size, fingerprints it and records it. It never closes a task (only
 * orvanta_update_task_status does, with the owner's confirmation) and never
 * changes or removes anything a proof already holds: the database seals both.
 */

import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import {
  compareWithCompany,
  mergeReadings,
  proofReadingEnabled,
  readProofFile,
  type AttestedFacts,
  type MergedFacts,
  type ProofFlag,
  type ProofReading,
} from "./reading";
import {
  MAX_PROOF_FILE_BYTES,
  MAX_PROOF_FILES,
  PROOF_BUCKET,
  PROOF_MIME_TYPES,
  ProofError,
  checkDeclaredFile,
  isPathOfProof,
  proofObjectPath,
  sniffProofMime,
  type ProofMime,
} from "./rules";

export type ProofActor = { tenantId: string; actorId: string; actorRole: string; systemCall: boolean };
export type ProofFileView = {
  id: string;
  fileName: string;
  mimeType: ProofMime;
  sizeBytes: number;
  sha256: string;
  reading: ProofReading;
  createdAt: string;
};
export type CompanyFacts = { legalName: string | null; approvedFundingSAR: number | null; today: string };
export type ProofView = {
  id: string;
  taskId: string;
  sealed: boolean;
  note: string | null;
  confirmedAt: string | null;
  files: ProofFileView[];
  merged: MergedFacts;
  attested: AttestedFacts | null;
  flags: ProofFlag[];
  company: CompanyFacts;
  readingEnabled: boolean;
};

type Database = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type ProofRow = { id: string; tenant_id: string; task_id: string; confirmed_at: string | null; note: string | null; facts_attested: AttestedFacts | null };
type FileRow = { id: string; file_name: string; mime_type: ProofMime; size_bytes: number; sha256: string; reading: ProofReading; created_at: string; storage_path: string };

const OWNER_ROLES = new Set(["OWNER", "ADMIN"]);

function authorize(actor: ProofActor) {
  if (actor.systemCall || !OWNER_ROLES.has(actor.actorRole)) {
    throw new ProofError("FORBIDDEN", 403, "إثباتات التنفيذ للمالك أو المدير في جلسة بشرية فقط.");
  }
}

function database(): Database {
  const client = getSupabaseAdmin();
  if (!client) throw new ProofError("NOT_CONFIGURED", 503, "قاعدة البيانات غير مهيأة. لم يُحفظ شيء.");
  return client;
}

function storageError(context: string, error: { message?: string } | null | undefined): Error {
  return new Error(`${context}: ${error?.message || "unknown error"}`);
}

function cleanFileName(value: string): string {
  return String(value || "").replace(/[\u0000-\u001f]+/g, "").trim().slice(0, 200) || "document";
}

/** Riyadh's date, so "expired" means what the owner's calendar says. */
function todayInRiyadh(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(now);
}

async function ensureBucket(db: Database) {
  const options = { public: false, fileSizeLimit: MAX_PROOF_FILE_BYTES, allowedMimeTypes: [...PROOF_MIME_TYPES] };
  const { data, error } = await db.storage.getBucket(PROOF_BUCKET);
  if (error || !data) {
    const created = await db.storage.createBucket(PROOF_BUCKET, options);
    if (created.error && !/already exists/i.test(created.error.message)) throw storageError("creating the proof bucket", created.error);
    return;
  }
  if (data.public) {
    const updated = await db.storage.updateBucket(PROOF_BUCKET, options);
    if (updated.error) throw storageError("making the proof bucket private", updated.error);
  }
}

async function findProof(db: Database, tenantId: string, proofId: string): Promise<ProofRow> {
  const { data, error } = await db.from("execution_proofs").select("*").eq("tenant_id", tenantId).eq("id", proofId).maybeSingle();
  if (error) throw storageError("reading the proof", error);
  if (!data) throw new ProofError("NOT_FOUND", 404, "لم يُعثر على الإثبات.");
  return data as ProofRow;
}

async function listFiles(db: Database, proofId: string): Promise<FileRow[]> {
  const { data, error } = await db
    .from("execution_proof_files")
    .select("id,file_name,mime_type,size_bytes,sha256,reading,created_at,storage_path")
    .eq("proof_id", proofId)
    .order("created_at")
    .order("id");
  if (error) throw storageError("reading the proof's files", error);
  return (data || []) as FileRow[];
}

async function companyFacts(db: Database, tenantId: string, taskId: string): Promise<CompanyFacts> {
  const { data, error } = await db
    .from("company_approvals")
    .select("amount")
    .eq("tenant_id", tenantId)
    .eq("type", "BUDGET")
    .eq("status", "APPROVED")
    .eq("metadata->>taskId", taskId)
    .eq("metadata->>kind", "TASK_FUNDING");
  if (error) throw storageError("reading the step's approved funding", error);
  const amounts = (data || []).map((row: { amount: unknown }) => Number(row.amount)).filter((value: number) => Number.isFinite(value) && value > 0);
  return {
    legalName: process.env.COMPANY_LEGAL_NAME?.trim() || null,
    approvedFundingSAR: amounts.length ? amounts.reduce((sum: number, value: number) => sum + value, 0) : null,
    today: todayInRiyadh(),
  };
}

async function view(db: Database, tenantId: string, proof: ProofRow): Promise<ProofView> {
  const rows = await listFiles(db, proof.id);
  const files: ProofFileView[] = rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    reading: row.reading,
    createdAt: row.created_at,
  }));
  const merged = mergeReadings(files.map((file) => ({ id: file.id, reading: file.reading })));
  const sealed = Boolean(proof.confirmed_at);
  const attested = proof.facts_attested ?? null;
  const company = await companyFacts(db, tenantId, proof.task_id);
  const facts: AttestedFacts = sealed && attested
    ? attested
    : Object.fromEntries(Object.entries(merged).map(([key, fact]) => [key, fact?.value]));
  return {
    id: proof.id,
    taskId: proof.task_id,
    sealed,
    note: proof.note,
    confirmedAt: proof.confirmed_at,
    files,
    merged,
    attested,
    flags: compareWithCompany(facts, company),
    company,
    readingEnabled: proofReadingEnabled(),
  };
}

/** Opens the step's draft, or resumes the one already open. */
export async function startProof(actor: ProofActor, taskId: string): Promise<ProofView> {
  authorize(actor);
  const db = database();
  const { data: task, error } = await db.from("tasks").select("id,status,metadata").eq("tenant_id", actor.tenantId).eq("id", taskId).maybeSingle();
  if (error) throw storageError("reading the step", error);
  if (!task) throw new ProofError("NOT_FOUND", 404, "لم يُعثر على الخطوة.");
  if (["DONE", "ARCHIVED"].includes(task.status)) throw new ProofError("SEALED", 409, "هذه الخطوة مؤكدة بالفعل.");
  const metadata = (task.metadata || {}) as Record<string, unknown>;
  const realWorld = metadata.executionKind === "REAL_WORLD" || metadata.requiresFunding === true || metadata.requiresFunding === "true";
  if (!realWorld) throw new ProofError("INVALID_INPUT", 400, "هذه خطوة داخلية ولا تحتاج إثبات تنفيذ فعلي.");

  const openDraft = async () => {
    const result = await db.from("execution_proofs").select("*").eq("tenant_id", actor.tenantId).eq("task_id", taskId).is("confirmed_at", null).maybeSingle();
    if (result.error) throw storageError("reading the open draft", result.error);
    return result.data as ProofRow | null;
  };
  let proof = await openDraft();
  if (!proof) {
    const created = await db.from("execution_proofs").insert({ tenant_id: actor.tenantId, task_id: taskId, created_by: actor.actorId }).select().single();
    // Two tabs opening the same step at once: the database keeps one draft.
    if (created.error?.code === "23505") proof = await openDraft();
    else if (created.error) throw storageError("opening a draft", created.error);
    else proof = created.data as ProofRow;
  }
  if (!proof) throw new Error("the open draft vanished while it was being opened");
  return view(db, actor.tenantId, proof);
}

export async function createUploadSlot(
  actor: ProofActor,
  proofId: string,
  file: { fileName: string; mimeType: string; sizeBytes: number }
): Promise<{ path: string; token: string; signedUrl: string }> {
  authorize(actor);
  checkDeclaredFile(file);
  const db = database();
  const proof = await findProof(db, actor.tenantId, proofId);
  if (proof.confirmed_at) throw new ProofError("SEALED", 409, "هذا الإثبات مختوم ولا يقبل ملفات جديدة.");
  const { count, error } = await db.from("execution_proof_files").select("id", { count: "exact", head: true }).eq("proof_id", proof.id);
  if (error) throw storageError("counting the proof's files", error);
  if ((count ?? 0) >= MAX_PROOF_FILES) throw new ProofError("FILE_LIMIT", 409, "الحد عشرة ملفات للإثبات الواحد.");
  await ensureBucket(db);
  const path = proofObjectPath(actor.tenantId, proof.task_id, proof.id, file.mimeType as ProofMime, randomUUID());
  const slot = await db.storage.from(PROOF_BUCKET).createSignedUploadUrl(path);
  if (slot.error || !slot.data) throw storageError("creating an upload slot", slot.error);
  return { path, token: slot.data.token, signedUrl: slot.data.signedUrl };
}

export async function registerProofFile(actor: ProofActor, proofId: string, path: string, fileName: string): Promise<ProofView> {
  authorize(actor);
  const db = database();
  const proof = await findProof(db, actor.tenantId, proofId);
  if (proof.confirmed_at) throw new ProofError("SEALED", 409, "هذا الإثبات مختوم ولا يقبل ملفات جديدة.");
  if (!isPathOfProof(path, actor.tenantId, proof.task_id, proof.id)) {
    throw new ProofError("INVALID_INPUT", 400, "مسار الملف لا يتبع هذا الإثبات.");
  }
  // A repeated registration of the same upload changes nothing.
  if ((await listFiles(db, proof.id)).some((row) => row.storage_path === path)) return view(db, actor.tenantId, proof);

  const bucket = db.storage.from(PROOF_BUCKET);
  const downloaded = await bucket.download(path);
  if (downloaded.error || !downloaded.data) throw new ProofError("NOT_FOUND", 404, "لم يصل الملف إلى المخزن. أعد رفعه.");
  // Only ever an object no file row points at.
  const discard = async () => {
    const { data: held } = await db.from("execution_proof_files").select("id").eq("storage_path", path).maybeSingle();
    if (!held) await bucket.remove([path]);
  };

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (bytes.length > MAX_PROOF_FILE_BYTES) {
    await discard();
    throw new ProofError("TOO_LARGE", 413, "الحد الأعلى للملف 20 ميجابايت.");
  }
  const mime = bytes.length ? sniffProofMime(bytes) : null;
  if (!mime) {
    await discard();
    throw new ProofError("UNSUPPORTED_TYPE", 415, "محتوى الملف ليس PDF ولا صورة JPEG أو PNG أو WEBP.");
  }
  const name = cleanFileName(fileName);
  const reading = await readProofFile({ bytes, mime, fileName: name });
  const inserted = await db
    .from("execution_proof_files")
    .insert({
      proof_id: proof.id,
      tenant_id: actor.tenantId,
      storage_path: path,
      file_name: name,
      mime_type: mime,
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      reading,
    })
    .select()
    .single();
  if (inserted.error) {
    await discard();
    const message = String(inserted.error.message || "");
    if (inserted.error.code === "23505") throw new ProofError("DUPLICATE_FILE", 409, "هذا الملف مرفق بالفعل في هذا الإثبات.");
    if (message.includes("PROOF_FILE_LIMIT")) throw new ProofError("FILE_LIMIT", 409, "الحد عشرة ملفات للإثبات الواحد.");
    if (message.includes("PROOF_SEALED")) throw new ProofError("SEALED", 409, "هذا الإثبات مختوم ولا يقبل ملفات جديدة.");
    throw storageError("recording the file", inserted.error);
  }
  return view(db, actor.tenantId, proof);
}

export async function getProof(actor: ProofActor, proofId: string): Promise<ProofView> {
  authorize(actor);
  const db = database();
  return view(db, actor.tenantId, await findProof(db, actor.tenantId, proofId));
}

/** A link that works for 60 seconds, made only after the session check. */
export async function openProofFile(actor: ProofActor, fileId: string): Promise<{ url: string; expiresInSeconds: 60 }> {
  authorize(actor);
  const db = database();
  const { data, error } = await db.from("execution_proof_files").select("id,storage_path").eq("tenant_id", actor.tenantId).eq("id", fileId).maybeSingle();
  if (error) throw storageError("reading the file", error);
  if (!data) throw new ProofError("NOT_FOUND", 404, "لم يُعثر على الملف.");
  const signed = await db.storage.from(PROOF_BUCKET).createSignedUrl(data.storage_path, 60);
  if (signed.error || !signed.data) throw storageError("signing a link", signed.error);
  return { url: signed.data.signedUrl, expiresInSeconds: 60 };
}
