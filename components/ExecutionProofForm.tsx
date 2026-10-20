"use client";

/**
 * Confirming a real-world step, with its documents.
 *
 * Documents are optional (owner decision, 2026-10-20): a note alone confirms
 * exactly as before. Each document goes from the browser straight to private
 * storage through a signed URL; the server then checks its real type,
 * fingerprints it and, only where the owner allowed it, reads it. The owner
 * checks what was read, corrects it, and confirms. The database call that
 * closes the step seals the proof in the same transaction, so nothing on this
 * screen can change a proof afterwards.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Paperclip, ShieldCheck } from "lucide-react";
import { PROOF_FACT_KEYS, compareWithCompany, type AttestedFacts, type ProofFactKey } from "@/lib/executionProofs/facts";
import { FACT_LABELS, READING_LABELS, confidenceText, flagMessage, formatSize } from "@/lib/executionProofs/copy";
import { openProofFileInNewTab, uploadToProofSlot } from "@/lib/executionProofs/client";
import { MAX_PROOF_FILE_BYTES, MAX_PROOF_FILES, PROOF_MIME_TYPES, isProofMime } from "@/lib/executionProofs/rules";
import type { ProofView } from "@/lib/executionProofs/store";

type Pending = { key: string; name: string; status: "uploading" | "refused"; message: string };
type Answer = { ok: true; [key: string]: any } | { ok: false; message: string };

const NOTE_LABEL = "الإثبات: ماذا تم فعلياً، ومتى، وأين يمكن التحقق منه؟";
const DATE_FACTS = new Set<ProofFactKey>(["issueDate", "expiryDate"]);

async function proofApi(body: Record<string, unknown>): Promise<Answer> {
  try {
    const response = await fetch("/api/tasks/proof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) return { ok: false, message: json?.message || "تعذر إكمال العملية. أعد المحاولة." };
    return json;
  } catch {
    return { ok: false, message: "انقطع الاتصال. أعد المحاولة." };
  }
}

/** The browser's own check, so a file the server would refuse never leaves the device. */
function refusal(file: File): string | null {
  if (!isProofMime(file.type)) return "المقبول: PDF أو صورة JPEG أو PNG أو WEBP.";
  if (file.size > MAX_PROOF_FILE_BYTES) return "الحد الأعلى للملف 20 ميجابايت.";
  if (file.size < 1) return "الملف فارغ.";
  return null;
}

export default function ExecutionProofForm({ taskId, onConfirmed, onCancel }: {
  taskId: string;
  onConfirmed: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const uid = useId();
  const [proof, setProof] = useState<ProofView | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [facts, setFacts] = useState<AttestedFacts>({});
  const edited = useRef(new Set<ProofFactKey>());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const uploading = pending.some((item) => item.status === "uploading");
  const files = proof?.files ?? [];
  const hasFiles = files.length > 0;

  /** Takes the server's view; what the owner typed is never overwritten by a reading. */
  const adopt = useCallback((next: ProofView) => {
    setProof(next);
    setFacts((current) => {
      const merged: AttestedFacts = { ...current };
      // An untouched field mirrors the readings, so it empties when its file is removed.
      for (const key of PROOF_FACT_KEYS) {
        if (!edited.current.has(key)) merged[key] = next.merged[key]?.value ?? "";
      }
      return merged;
    });
  }, []);

  // A draft left open earlier (documents attached, tab closed) comes back with them.
  useEffect(() => {
    let live = true;
    fetch(`/api/tasks/proof?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => { if (live && json?.ok && json.proof) adopt(json.proof as ProofView); })
      .catch(() => { /* nothing to resume; a note alone still confirms */ });
    return () => { live = false; };
  }, [taskId, adopt]);

  async function addFiles(chosen: File[]) {
    if (chosen.length === 0) return;
    setError("");
    const room = MAX_PROOF_FILES - files.length;
    const batch: Array<Pending & { file: File }> = chosen.map((file, index) => {
      const refused = refusal(file) ?? (index >= room ? "الحد عشرة ملفات للإثبات الواحد." : null);
      return { key: `${uid}-${Date.now()}-${index}`, name: file.name, file, status: refused ? "refused" : "uploading", message: refused ?? "" };
    });
    setPending(batch.map(({ key, name, status, message }) => ({ key, name, status, message })));
    const accepted = batch.filter((item) => item.status === "uploading");
    if (accepted.length === 0) return;

    let current = proof;
    if (!current) {
      const started = await proofApi({ action: "start", taskId });
      if (!started.ok) {
        setPending((items) => items.filter((item) => item.status !== "uploading"));
        setError(started.message);
        return;
      }
      current = started.proof as ProofView;
      adopt(current);
    }
    for (const item of accepted) {
      const fail = (message: string) => setPending((items) => items.map((entry) => (entry.key === item.key ? { ...entry, status: "refused", message } : entry)));
      const slot = await proofApi({ action: "slot", proofId: current.id, fileName: item.name, mimeType: item.file.type, sizeBytes: item.file.size });
      if (!slot.ok) { fail(slot.message); continue; }
      try {
        await uploadToProofSlot({ signedUrl: slot.signedUrl }, item.file);
      } catch (uploadError) {
        fail(uploadError instanceof Error ? uploadError.message : "تعذر رفع الملف.");
        continue;
      }
      const registered = await proofApi({ action: "register", proofId: current.id, path: slot.path, fileName: item.name });
      if (!registered.ok) { fail(registered.message); continue; }
      current = registered.proof as ProofView;
      adopt(current);
      setPending((items) => items.filter((entry) => entry.key !== item.key));
    }
  }

  async function removeFile(fileId: string) {
    setError("");
    setRemoving(fileId);
    const answer = await proofApi({ action: "remove", fileId });
    setRemoving(null);
    if (answer.ok) adopt(answer.proof as ProofView);
    else setError(answer.message);
  }

  async function openFile(fileId: string) {
    setError("");
    try {
      await openProofFileInNewTab(fileId);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "تعذر فتح الملف.");
    }
  }

  async function confirm() {
    const proofNote = note.trim();
    if (proofNote.length < 10) {
      setError("اكتب إثباتاً لا يقل عن 10 أحرف: ماذا تم فعلياً، ومتى، وأين يمكن التحقق منه.");
      return;
    }
    setBusy(true);
    setError("");
    const attestedFacts = Object.fromEntries(
      PROOF_FACT_KEYS.map((key) => [key, (facts[key] || "").trim()] as const).filter(([, value]) => value)
    );
    try {
      const response = await fetch("/api/tasks/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, confirmReal: true, proofNote, ...(proof && hasFiles ? { proofId: proof.id, attestedFacts } : {}) }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setError(json?.message || "تعذر تسجيل التأكيد.");
        return;
      }
      await onConfirmed();
    } catch {
      setError("تعذر تسجيل التأكيد.");
    } finally {
      setBusy(false);
    }
  }

  const flags = proof && hasFiles ? compareWithCompany(facts, proof.company) : [];
  const pickerId = `${uid}-files`;
  const noteId = `${uid}-note`;

  return (
    <div className="proof-form">
      <div className="proof-form__attach">
        <input
          id={pickerId}
          className="proof-form__picker"
          type="file"
          multiple
          accept={PROOF_MIME_TYPES.join(",")}
          disabled={uploading || busy}
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []);
            event.target.value = "";
            void addFiles(chosen);
          }}
        />
        <label htmlFor={pickerId} className="secondary-btn btn-sm">
          <Paperclip size={14} aria-hidden /> إرفاق مستند
        </label>
        <small>اختياري. PDF أو صورة، حتى 20 ميجابايت للملف وعشرة ملفات.</small>
      </div>

      {/* Always present, so the first upload's progress is announced too. */}
      <div aria-live="polite">
        {hasFiles || pending.length > 0 ? (
          <ul className="proof-files">
            {files.map((file) => (
              <li key={file.id}>
                <span className="proof-files__name">{file.fileName}</span>
                <small>
                  <span>{formatSize(file.sizeBytes)}</span> · <span dir="ltr">{file.sha256.slice(0, 12)}</span> · <span>{READING_LABELS[file.reading.status]}</span>
                </small>
                <span className="proof-files__actions">
                  <button type="button" className="text-action" aria-label={`فتح ${file.fileName}`} onClick={() => void openFile(file.id)}>فتح</button>
                  <button type="button" className="text-action" aria-label={`إزالة ${file.fileName}`} disabled={uploading || busy || removing !== null} onClick={() => void removeFile(file.id)}>
                    {removing === file.id && <Loader2 className="spin" size={12} aria-hidden />}إزالة
                  </button>
                </span>
              </li>
            ))}
            {pending.map((item) => (
              <li key={item.key} className={item.status === "refused" ? "is-refused" : undefined}>
                <span className="proof-files__name">{item.name}</span>
                <small>
                  {item.status === "uploading" ? <><Loader2 className="spin" size={12} aria-hidden /> يُرفع…</> : item.message}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="proof-form__empty">بلا مستند حتى الآن. يكفي أن تكتب الإثبات أدناه.</p>
        )}
      </div>

      {proof && hasFiles && (
        <fieldset className="proof-facts">
          <legend>بيانات المستند</legend>
          <p className="proof-facts__hint">
            {proof.readingEnabled
              ? "ما قُرئ آلياً معروض للمراجعة. صحّح ما يلزم، فما تثبّته هنا يُختم مع التأكيد."
              : "القراءة الآلية متوقفة، فاكتب ما يلزم كما يظهر في المستند. كل الحقول اختيارية."}
          </p>
          <div className="proof-facts__grid">
            {PROOF_FACT_KEYS.map((key) => {
              const id = `${uid}-${key}`;
              const read = proof.merged[key];
              const source = read ? files.find((file) => file.id === read.fileId) : undefined;
              const differs = read && (facts[key] || "").trim() !== read.value;
              return (
                <div key={key} className="proof-fact">
                  <label htmlFor={id}>{FACT_LABELS[key]}</label>
                  <input
                    id={id}
                    className="input"
                    type={DATE_FACTS.has(key) ? "date" : "text"}
                    inputMode={key === "amount" ? "decimal" : undefined}
                    maxLength={300}
                    value={facts[key] || ""}
                    aria-describedby={read ? `${id}-read` : undefined}
                    onChange={(event) => {
                      edited.current.add(key);
                      setFacts((current) => ({ ...current, [key]: event.target.value }));
                    }}
                  />
                  {read && <small id={`${id}-read`}>{`قُرئ من «${source?.fileName ?? "مستند"}» بثقة ${confidenceText(read.confidence)}`}</small>}
                  {differs && <small>{`القيمة المقروءة: ${read.value}`}</small>}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {proof && flags.length > 0 && (
        <div className="notice integration-notice warning proof-flags" role="status">
          <strong>تحقق قبل التأكيد. التنبيه لا يمنعه.</strong>
          <ul>
            {flags.map((flag) => <li key={flag.code}>{flagMessage(flag, facts, proof.company)}</li>)}
          </ul>
        </div>
      )}

      <div className="proof-form__note">
        <label htmlFor={noteId}>{NOTE_LABEL}</label>
        <textarea
          id={noteId}
          className="input"
          rows={2}
          maxLength={3000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="مثال: صدر السجل التجاري رقم 1010… بتاريخ 12/03 عبر منصة الأعمال."
        />
      </div>

      {error && <p className="notice error" role="alert">{error}</p>}

      <div className="proof-form__actions">
        <button type="button" className="primary-btn btn-sm" disabled={uploading || busy} onClick={() => void confirm()}>
          {busy ? <Loader2 className="spin" size={14} aria-hidden /> : <ShieldCheck size={14} aria-hidden />} تسجيل التأكيد
        </button>
        {onCancel && <button type="button" className="text-action" disabled={busy} onClick={onCancel}>إلغاء</button>}
        {hasFiles && <small>يُختم الإثبات بمستنداته وبصماتها لحظة التأكيد، ولا يُعدّل بعدها.</small>}
      </div>
    </div>
  );
}
