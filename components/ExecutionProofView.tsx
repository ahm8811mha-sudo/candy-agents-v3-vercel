"use client";

/**
 * The sealed proof on a confirmed step: what the owner wrote and attested,
 * what each file is, and a way to open it. Read only, because the database
 * refuses any change to a sealed proof.
 *
 * No storage address is ever put on the page: a file opens through a link
 * the server signs for 60 seconds, after its session check, on the click.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PROOF_FACT_KEYS, compareWithCompany, isGovernmentTrackable } from "@/lib/executionProofs/facts";
import { FACT_LABELS, flagMessage, formatSize } from "@/lib/executionProofs/copy";
import { openProofFileInNewTab } from "@/lib/executionProofs/client";
import type { ProofView } from "@/lib/executionProofs/store";

const sealDate = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium" });

export default function ExecutionProofView({ proofId }: { proofId: string }) {
  const [proof, setProof] = useState<ProofView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    fetch(`/api/tasks/proof?proofId=${encodeURIComponent(proofId)}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!live) return;
        if (!response.ok || !json?.ok || !json.proof) setLoadError(json?.message || "تعذر تحميل الإثبات.");
        else setProof(json.proof as ProofView);
      })
      .catch(() => { if (live) setLoadError("تعذر تحميل الإثبات."); });
    return () => { live = false; };
  }, [proofId]);

  async function open(fileId: string) {
    setError("");
    try {
      await openProofFileInNewTab(fileId);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "تعذر فتح الملف.");
    }
  }

  async function track(fileId: string) {
    setTracking(fileId);
    setError("");
    try {
      const response = await fetch("/api/tasks/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "track", fileId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.message || "تعذرت إضافة الملف إلى العلاقات الحكومية.");
      setTracked((current) => ({ ...current, [fileId]: true }));
    } catch (trackError) {
      setError(trackError instanceof Error && trackError.message !== "Failed to fetch" ? trackError.message : "تعذرت إضافة الملف إلى العلاقات الحكومية.");
    } finally {
      setTracking(null);
    }
  }

  if (loadError) return <p className="notice error" role="alert">{loadError}</p>;
  if (!proof) return <p className="proof-view__loading" role="status"><Loader2 className="spin" size={14} aria-hidden /> جارٍ تحميل الإثبات…</p>;

  const attested = proof.attested ?? {};
  const facts = PROOF_FACT_KEYS.filter((key) => attested[key]);
  const flags = compareWithCompany(attested, proof.company);

  return (
    <section className="proof-view" aria-label="إثبات التنفيذ">
      <p className="proof-view__seal">
        مختوم {proof.confirmedAt ? sealDate.format(new Date(proof.confirmedAt)) : ""} · {proof.files.length} مستند
      </p>
      {proof.note && <p className="proof-view__note">{proof.note}</p>}

      {facts.length > 0 ? (
        <dl className="proof-view__facts">
          {facts.map((key) => {
            const read = proof.merged[key];
            return (
              <div key={key}>
                <dt>{FACT_LABELS[key]}</dt>
                <dd>
                  <span>{attested[key]}</span>
                  {read && read.value !== attested[key] && <small>{`قُرئ آلياً: ${read.value}`}</small>}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="proof-view__empty">لم تُدوَّن بيانات للمستند.</p>
      )}

      {flags.length > 0 && (
        <div className="notice integration-notice warning proof-flags" role="status">
          <ul>{flags.map((flag) => <li key={flag.code}>{flagMessage(flag, attested, proof.company)}</li>)}</ul>
        </div>
      )}

      <ul className="proof-files">
        {proof.files.map((file) => (
          <li key={file.id}>
            <span className="proof-files__name">{file.fileName}</span>
            <small>
              <span>{formatSize(file.sizeBytes)}</span> · <span dir="ltr">{file.sha256.slice(0, 12)}</span>
            </small>
            <span className="proof-files__actions">
              <button type="button" className="text-action" aria-label={`فتح ${file.fileName}`} onClick={() => void open(file.id)}>فتح</button>
              {isGovernmentTrackable(file.reading) && !tracked[file.id] && (
                <button type="button" className="text-action" disabled={tracking === file.id} onClick={() => void track(file.id)}>
                  {tracking === file.id && <Loader2 className="spin" size={12} aria-hidden />}تتبّعها في العلاقات الحكومية
                </button>
              )}
            </span>
            {tracked[file.id] && (
              <small className="proof-files__done">
                أُضيفت إلى <Link href="/departments/government-relations">العلاقات الحكومية</Link> لمتابعة تجديدها.
              </small>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
  );
}
