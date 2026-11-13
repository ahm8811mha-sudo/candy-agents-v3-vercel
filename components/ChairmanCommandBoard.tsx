"use client";

import { useCallback, useEffect, useState } from "react";
import ChairmanCommandComposer, { type IssuedCommand } from "./ChairmanCommandComposer";

type Station = { id: string; title: string; ownerName: string; kind: string; status: string };
type BoardCommand = IssuedCommand & {
  steps?: Station[];
  awaitingDecision?: boolean;
  priority?: string;
  dueAt?: string;
  sla?: { label: string; overdue: boolean; level: number };
  history?: Array<{ at: string; by: string; action: string; note: string }>;
};
const PRIORITY: Record<string, string> = { URGENT: "عاجل", HIGH: "عالٍ", MEDIUM: "متوسط", LOW: "منخفض" };
const when = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmt = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? when.format(d) : ""; };

function Stations({ steps }: { steps: Station[] }) {
  const currentIndex = steps.findIndex((step) => step.status !== "DONE");
  return <ol className="ov-stations" aria-label="محطات الأمر">{steps.map((step, index) => {
    const cls = step.status === "DONE" ? "is-done" : step.status === "BLOCKED" ? "is-blocked" : step.kind === "DECISION" ? "is-decision" : index === currentIndex ? "is-current" : "";
    return <li key={step.id} className={cls} title={step.title}><span aria-hidden>{step.status === "DONE" ? "✓" : String(index + 1)}</span>{step.title.slice(0, 40)}<small> · {step.ownerName}</small></li>;
  })}</ol>;
}

function DecisionButtons({ id, onDone }: { id: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision: string) {
    if (decision === "return" && note.trim().length < 3) { setError("اكتب ملاحظة الإعادة في الحقل أولاً."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decide", commandId: id, decision, note: note.trim() || undefined }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || "تعذر تسجيل القرار.");
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تسجيل القرار."); }
    finally { setBusy(false); }
  }
  return <div className="ov-section" style={{ margin: "10px 0 0", padding: 12 }}>
    <strong style={{ fontSize: 13 }}>بانتظار قرارك</strong>
    <textarea className="ov-note" aria-label="ملاحظة القرار" value={note} onChange={(event) => setNote(event.target.value)} placeholder="ملاحظة (لازمة عند الإعادة)" />
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    <div className="ov-actions" style={{ marginTop: 8 }}>
      <button type="button" className="ov-btn is-primary" disabled={busy} onClick={() => void decide("approve")}>اعتماد</button>
      <button type="button" className="ov-btn is-danger" disabled={busy} onClick={() => void decide("reject")}>رفض</button>
      <button type="button" className="ov-btn" disabled={busy} onClick={() => void decide("return")}>إعادة بملاحظة</button>
      <button type="button" className="ov-btn is-quiet" disabled={busy} onClick={() => void decide("defer")}>تأجيل أسبوع</button>
    </div>
  </div>;
}
import { commandStatusLabel } from "@/lib/company/commandStatusLabel";

export default function ChairmanCommandBoard() {
  const [commands, setCommands] = useState<BoardCommand[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [currentId, setCurrentId] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/commands", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok || !Array.isArray(json.commands)) throw new Error(json.message || "تعذر قراءة الأوامر.");
      setCommands(json.commands);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر قراءة الأوامر.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 15_000);
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    function syncHash() {
      setCurrentId(window.location.hash.replace(/^#/, ""));
    }
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!currentId || !ready) return;
    document.getElementById(currentId)?.scrollIntoView({ block: "start" });
  }, [currentId, ready]);

  function remember(command: IssuedCommand) {
    setCommands((current) => [command, ...current.filter((item) => item.id !== command.id)]);
    setCurrentId(command.id);
    window.history.replaceState(null, "", `#${command.id}`);
  }

  return (
    <main className="workspace command-board">
      <header className="workspace-heading">
        <div>
          <h1>الأوامر</h1>
          <p className="workspace-intro">كل أمر صدر من رئيس مجلس الإدارة، ومالكه، وخطوته، وما يوقفه، ونتيجته.</p>
        </div>
      </header>
      <ChairmanCommandComposer onIssued={remember} />
      {error ? <p className="order-feedback" role="alert">{error}</p> : null}
      {!ready ? <p className="workspace-empty" role="status">جارٍ قراءة الأوامر…</p> : null}
      {ready && commands.length === 0 ? <p className="workspace-empty">لا أوامر مسجّلة بعد.</p> : null}
      <div className="command-list">
        {commands.map((command) => (
          <article id={command.id} key={command.id} className={command.id === currentId ? "command-card is-current" : "command-card"}>
            <h3>{command.subject}</h3>
            <div className="ov-actions">{command.priority ? <span className="ov-tag">{PRIORITY[command.priority] || command.priority}</span> : null}{command.sla ? <span className={"ov-tag" + (command.sla.overdue ? " is-red" : "")}>{command.sla.label}</span> : null}{command.dueAt ? <span className="ov-muted">الموعد: {fmt(command.dueAt)}</span> : null}</div>
            {command.steps?.length ? <Stations steps={command.steps} /> : null}
            {command.awaitingDecision ? <DecisionButtons id={command.id} onDone={() => void load()} /> : null}
            <dl className="command-facts">
              <div><dt>المسؤول</dt><dd>{command.ownerName}</dd></div>
              <div><dt>الحالة</dt><dd>{commandStatusLabel(command.status)}</dd></div>
              <div><dt>الخطوة</dt><dd>{command.currentStep || "لم تبدأ"}</dd></div>
              <div><dt>العوائق</dt><dd>{command.blockers?.length ? command.blockers.join(" · ") : "لا عوائق"}</dd></div>
              <div><dt>النتيجة والدليل</dt><dd className="command-result">{command.resultReport || "لا نتيجة بعد."}</dd></div>
            </dl>
            {command.history?.length ? <details className="ov-muted"><summary>سجل الأمر ({command.history.length})</summary><ul className="ov-list" style={{ marginTop: 8 }}>{command.history.slice().reverse().slice(0, 10).map((entry, index) => <li key={entry.at + index}><span>{entry.note}</span><small>{fmt(entry.at)} · {entry.by}</small></li>)}</ul></details> : null}
          </article>
        ))}
      </div>
    </main>
  );
}
