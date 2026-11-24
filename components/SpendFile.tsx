"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CounterItemRow } from "./CounterDrilldown";
import type { CounterItem } from "@/lib/company/counterItems";

type File = {
  item: CounterItem; detail: string; approvalStatus: string; preparedBy: string;
  decidedAt: string | null; decisionNote: string | null;
  memo: { options: string; expectedReturn: string; risks: string } | null;
  reviews: Array<{ stage: string; stageName: string; result: string; note: string; by: string; byName: string; at: string }>;
  archived: { reason: string; at: string } | null;
  position: { stage: string; holder: string | null; holderName: string; since: string; slaHours: number; overdueHours: number; escalations: number; nextStep: string } | null;
  decision: { actionable: boolean; canApprove: boolean; stopped: { label: string; reason: string; note: string } | null };
  options?: Option[];
  consultations?: Array<{ result: string; note: string; by: string; byName: string; at: string }>;
  chosenOption?: Option | null;
  project?: { id: string; href: string } | null;
};
type Option = { key: string; label: string; amountSAR: number; score: number; recommended: boolean; rationale: string };
type Choice = "approve" | "reject" | "return" | "defer";

const when = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmt = (iso?: string | null) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? when.format(d) : ""; };
const STATUS: Record<string, string> = { APPROVED: "معتمد", REJECTED: "مرفوض", PENDING: "قيد السلسلة", DEFERRED: "مؤجل" };
const LABEL: Record<Choice, string> = { approve: "اعتماد الصرف", reject: "رفض", return: "إعادة للقسم بملاحظة", defer: "تأجيل أسبوع" };

async function chooseOption(id: string, option: Option) {
  const res = await fetch("/api/approvals/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision: option.amountSAR > 0 ? "APPROVED" : "REJECTED", optionKey: option.key }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || "تعذر تسجيل اختيارك.");
}

async function decide(id: string, choice: Choice, note: string) {
  if (choice === "return") {
    const res = await fetch("/api/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decide", decision: "return", approvalId: id, note }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || "تعذر تسجيل الإعادة.");
    return;
  }
  const decision = choice === "approve" ? "APPROVED" : choice === "reject" ? "REJECTED" : "DEFERRED";
  const res = await fetch("/api/approvals/decisions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, decision, note: note || (decision === "DEFERRED" ? "تأجيل أسبوع من ملف الطلب" : undefined), remindAt: decision === "DEFERRED" ? new Date(Date.now() + 7 * 86_400_000).toISOString() : undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || "تعذر تسجيل القرار.");
}

function DecisionPanel({ file, onDone }: { file: File; onDone: (text: string) => void }) {
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<Choice | null>(null);
  const [busy, setBusy] = useState<Choice | null>(null);
  const [error, setError] = useState("");
  const choices: Choice[] = file.decision.canApprove ? ["approve", "reject", "return", "defer"] : ["reject"];
  async function act(choice: Choice) {
    const needsNote = choice === "reject" || choice === "return";
    if (needsNote && asking !== choice) { setAsking(choice); setError(""); return; }
    if (needsNote && note.trim().length < 3) { setError(choice === "reject" ? "اكتب سبب الرفض (ثلاثة أحرف على الأقل)." : "اكتب ملاحظة الإعادة (ثلاثة أحرف على الأقل)."); return; }
    setBusy(choice); setError("");
    try {
      await decide(file.item.id, choice, note.trim());
      onDone(choice === "approve" ? "سُجّل اعتمادك." : choice === "reject" ? "سُجّل الرفض وأُقفل الطلب." : choice === "return" ? "أُعيد الطلب للقسم بملاحظتك." : "أُجّل الطلب أسبوعاً.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تسجيل القرار."); }
    finally { setBusy(null); }
  }
  return <section className="ov-section" aria-labelledby="spend-decide"><h2 id="spend-decide">قرارك</h2>
    {file.decision.stopped ? <p className="ov-alert" role="status">{file.decision.stopped.label}. {file.decision.stopped.reason}{file.decision.stopped.note ? `: ${file.decision.stopped.note}` : ""}. لا يُعتمد طلب أوقفته السلسلة؛ يمكنك إقفاله بالرفض.</p> : null}
    {asking ? <textarea className="ov-note" aria-label={asking === "reject" ? "سبب الرفض" : "ملاحظة الإعادة"} value={note} onChange={(e) => setNote(e.target.value)} placeholder={asking === "reject" ? "سبب الرفض" : "ما الذي يحتاج تصحيحاً قبل العودة إليك؟"} /> : null}
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    <div className="ov-actions">{choices.map((choice) => <button key={choice} type="button" disabled={Boolean(busy)} onClick={() => void act(choice)} className={"ov-btn" + (choice === "approve" ? " is-primary" : choice === "reject" ? " is-danger" : "")}>
      {busy === choice ? "جارٍ التسجيل" : asking === choice ? (choice === "reject" ? "تأكيد الرفض" : "إرسال الإعادة") : LABEL[choice]}</button>)}</div>
  </section>;
}

function OptionsPanel({ file, canChoose, onDone }: { file: File; canChoose: boolean; onDone: (text: string) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const options = [...(file.options || [])].sort((a, b) => b.score - a.score);
  if (!options.length) return null;
  async function pick(option: Option) {
    setBusy(option.key); setError("");
    try { await chooseOption(file.item.id, option); onDone(`سُجّل اختيارك: ${option.label}${option.amountSAR > 0 ? "" : " (بلا صرف)"}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تسجيل اختيارك."); }
    finally { setBusy(""); }
  }
  return <section className="ov-section" aria-labelledby="spend-options"><h2 id="spend-options">الخيارات ونسبة الأفضلية</h2>
    <p className="ov-muted">أعدّها سلطان بعد المالية والحوكمة. النسبة: مدى الثقة أن الخيار هو الأفضل، ومجموعها 100%.</p>
    <ul className="ov-list">{options.map((o) => <li key={o.key} className={"ov-option" + (o.recommended ? " is-best" : "")}>
      <div className="ov-drill-top"><strong>({o.key}) {o.label}</strong><span className="ov-drill-amount">{o.amountSAR > 0 ? `${o.amountSAR.toLocaleString("ar-SA-u-nu-latn")} ر.س` : "بلا صرف"}</span></div>
      <div className="ov-score" role="meter" aria-label={`نسبة أفضلية الخيار ${o.key}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={o.score}><span style={{ width: `${o.score}%` }} /></div>
      <div className="ov-drill-meta"><b>{o.score}%</b>{o.recommended ? <span className="ov-tag is-green">الخيار الموصى به</span> : null}{o.rationale ? <span>{o.rationale}</span> : null}</div>
      {canChoose ? <div className="ov-actions"><button type="button" className={"ov-btn" + (o.recommended ? " is-primary" : "")} disabled={Boolean(busy)} onClick={() => void pick(o)}>{busy === o.key ? "جارٍ التسجيل" : `اختيار الخيار (${o.key})`}</button></div> : null}
    </li>)}</ul>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
  </section>;
}

/** The file of one spend request: where it is, every review, and the Chairman's decision when it is his turn. */
export default function SpendFile({ id }: { id: string }) {
  const [data, setData] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const load = useCallback(() => fetch(`/api/company/spend/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || "تعذر قراءة الطلب.");
    setData(json); setError("");
  }).catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر قراءة الطلب.")), [id]);
  useEffect(() => { void load(); }, [load]);
  const pos = data?.position;
  const decided = data && (data.approvalStatus === "APPROVED" || data.approvalStatus === "REJECTED");
  return <main className="ov-page" aria-labelledby="spend-title">
    <header className="ov-head"><div><h1 id="spend-title">ملف طلب صرف</h1><p>الملف كاملاً: أين الطلب، ومن يحمله، وكل مراجعة. القرار لك وحدك، ولا صرف بدون اعتمادك.</p></div>
      <div className="ov-actions"><Link className="ov-btn is-quiet" href="/">مكتبي</Link><Link className="ov-btn is-quiet" href="/office">المكتب الحي</Link></div></header>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    {done ? <p className="ov-ok" role="status">{done}</p> : null}
    {!data && !error ? <p className="ov-empty" role="status">جارٍ القراءة…</p> : null}
    {data ? <>
      <section className="ov-section"><ul className="ov-list"><CounterItemRow item={data.item} hideLink /></ul>
        <p className="ov-muted" style={{ marginTop: 8 }}>رقم الطلب: <bdi>{data.item.id}</bdi>{data.preparedBy ? ` · أعدّه: ${data.preparedBy}` : ""}{data.archived ? ` · مؤرشف ${fmt(data.archived.at)}: ${data.archived.reason}` : ""}</p>
        {data.detail ? <p style={{ fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{data.detail.slice(0, 2000)}</p> : null}
        <p className="ov-muted">المشروع: {data.project ? <Link href={data.project.href}>فتح المشروع المرتبط</Link> : "غير مرتبط بمشروع بعد"}</p>
      </section>
      {decided ? <section className="ov-section"><h2>القرار</h2><p><strong>{STATUS[data.approvalStatus]}</strong>{data.decidedAt ? ` · ${fmt(data.decidedAt)}` : ""}{data.decisionNote ? ` · ${data.decisionNote}` : ""}</p>{data.chosenOption ? <p className="ov-muted">الخيار المختار: ({data.chosenOption.key}) {data.chosenOption.label}</p> : null}</section>
        : pos ? <section className="ov-section" aria-labelledby="spend-where"><h2 id="spend-where">أين الطلب الآن</h2><dl className="command-facts">
          <div><dt>عند</dt><dd>{pos.holderName || "—"}</dd></div>
          <div><dt>منذ</dt><dd>{fmt(pos.since)}</dd></div>
          <div><dt>الخطوة التالية</dt><dd>{pos.nextStep}</dd></div>
          {pos.overdueHours ? <div><dt>التأخير</dt><dd className="ov-late">متأخر {pos.overdueHours} ساعة (المهلة {pos.slaHours} ساعة){pos.escalations ? ` · صُعّد ${pos.escalations} مرة لسلطان` : " · يُصعَّد تلقائياً لسلطان"}</dd></div> : null}
        </dl>{!data.decision.actionable ? <p className="ov-muted">يصلك الطلب في مكتبي للقرار فور اكتمال المراجعات: القسم، ثم عبدالرحمن وحارس، ثم توصية سلطان.</p> : null}</section> : null}
      {data.memo && (data.memo.options || data.memo.expectedReturn || data.memo.risks) ? <section className="ov-section"><h2>مذكرة القسم</h2><dl className="command-facts">
        {data.memo.options ? <div><dt>الخيارات</dt><dd>{data.memo.options}</dd></div> : null}
        {data.memo.expectedReturn ? <div><dt>العائد المتوقع</dt><dd>{data.memo.expectedReturn}</dd></div> : null}
        {data.memo.risks ? <div><dt>المخاطر</dt><dd>{data.memo.risks}</dd></div> : null}
      </dl></section> : null}
      <section className="ov-section"><h2>المراجعات</h2>
        {data.reviews.length ? <ul className="ov-list">{data.reviews.map((r) => <li key={r.stage + r.at}><strong>{r.stageName}: {r.result}</strong><span>{r.note}</span><small className="ov-muted">{r.byName} · {fmt(r.at)}</small></li>)}</ul> : <p className="ov-empty">لم تُسجّل مراجعة بعد. الطلب ما زال عند {pos?.holderName || "القسم"}.</p>}
      </section>
      {data.consultations?.length ? <section className="ov-section"><h2>آراء الأقسام المعنية</h2><ul className="ov-list">{data.consultations.map((r) => <li key={r.by + r.at}><strong>{r.byName}: {r.result}</strong><span>{r.note}</span><small className="ov-muted">{fmt(r.at)}</small></li>)}</ul></section> : null}
      <OptionsPanel file={data} canChoose={Boolean(data.decision.canApprove && !decided)} onDone={(text) => { setDone(text); void load(); }} />
      {data.decision.actionable && !decided ? <DecisionPanel file={data} onDone={(text) => { setDone(text); void load(); }} /> : null}
    </> : null}
  </main>;
}
