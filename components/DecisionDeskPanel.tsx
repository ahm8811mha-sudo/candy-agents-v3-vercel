"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DecisionDesk, DeskCard } from "@/lib/company/decisionDesk";

const number = new Intl.NumberFormat("ar-SA-u-nu-latn");
const time = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : time.format(d); };
const choiceLabel: Record<string, string> = { approve: "اعتماد", reject: "رفض", return: "إعادة بملاحظة", defer: "تأجيل أسبوع" };

async function send(card: DeskCard, choice: string, note: string) {
  if (card.kind === "spend" && choice !== "return") {
    const decision = choice === "approve" ? "APPROVED" : choice === "reject" ? "REJECTED" : "DEFERRED";
    const remindAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const res = await fetch("/api/approvals/decisions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: card.approvalId, decision, note: note || (decision === "DEFERRED" ? "تأجيل أسبوع من مكتب القرار" : undefined), remindAt: decision === "DEFERRED" ? remindAt : undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || "تعذر تسجيل القرار.");
    return;
  }
  const res = await fetch("/api/commands", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "decide", decision: choice, note: note || undefined, ...(card.kind === "spend" ? { approvalId: card.approvalId } : { commandId: card.commandId }) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.message || "تعذر تسجيل القرار.");
}

function Card({ card, onDone }: { card: DeskCard; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  async function act(choice: string) {
    if (choice === "return" && !asking) { setAsking(true); return; }
    if (choice === "return" && note.trim().length < 3) { setError("اكتب ملاحظة الإعادة (ثلاثة أحرف على الأقل)."); return; }
    setBusy(choice); setError("");
    try { await send(card, choice, note.trim()); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تسجيل القرار."); }
    finally { setBusy(""); }
  }
  return <article className={"ov-card" + (card.kind === "spend" ? " is-spend" : "")} aria-label={card.question}>
    <div className="ov-actions"><span className="ov-tag">{card.kind === "spend" ? "صرف" : card.kind === "external" ? "إرسال خارجي" : "قرار"}</span>{card.duplicateCount > 1 ? <span className="ov-tag is-amber">مكرر ×{number.format(card.duplicateCount)}</span> : null}{card.reminderDue ? <span className="ov-tag is-red">تذكير: مضى أكثر من 48 ساعة</span> : null}<span className="ov-muted">المسؤول: {card.ownerName}</span></div>
    <h3>{card.question}</h3>
    <div className="ov-rec"><strong>توصية سلطان: </strong>{card.recommendation}</div>
    <dl>
      {card.amountSAR != null ? <div><dt>المبلغ</dt><dd>{number.format(card.amountSAR)} ر.س</dd></div> : null}
      <div><dt>المالية</dt><dd>{card.finance}</dd></div>
      <div><dt>الحوكمة</dt><dd>{card.governance}</dd></div>
      {card.legal ? <div><dt>النظامية</dt><dd>{card.legal}</dd></div> : null}
      <div><dt>إن لم تقرر</dt><dd>{card.ifNoDecision}</dd></div>
      <div><dt>تنتهي البطاقة</dt><dd>{fmt(card.expiresAt)}</dd></div>
    </dl>
    {asking ? <textarea className="ov-note" aria-label="ملاحظة الإعادة" value={note} onChange={(event) => setNote(event.target.value)} placeholder="ما الذي يحتاج تصحيحاً قبل العودة إليك؟" /> : null}
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    <div className="ov-actions">
      {card.actions.map((choice) => <button key={choice} type="button" className={"ov-btn" + (choice === "approve" ? " is-primary" : choice === "reject" ? " is-danger" : "")} disabled={Boolean(busy)} onClick={() => void act(choice)}>{busy === choice ? "جارٍ التسجيل" : choice === "return" && asking ? "إرسال الإعادة" : choiceLabel[choice]}</button>)}
      <Link className="ov-btn is-quiet" href={card.evidencePath}>الملف والدليل</Link>
    </div>
  </article>;
}

export default function DecisionDeskPanel() {
  const [desk, setDesk] = useState<DecisionDesk | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/commands?view=desk", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "تعذر قراءة مكتب القرار.");
      setDesk(json.desk); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة مكتب القرار."); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, [load]);
  return <section className="ov-section" aria-labelledby="desk-title">
    <h2 id="desk-title">مكتب القرار <small>{desk ? `${number.format(desk.cards.length)} من 7 بطاقات · الملخص القادم ${fmt(desk.digestAt)}` : ""}</small></h2>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    {!desk && !error ? <p className="ov-empty" role="status">جارٍ قراءة البطاقات…</p> : null}
    {desk && desk.cards.length === 0 ? <p className="ov-empty">لا قرار ينتظرك الآن. كل بطاقة تصل بعد اكتمال عمل الفريق وتوصية سلطان.</p> : null}
    {desk ? <div className="ov-desk">{desk.cards.map((card) => <Card key={card.id} card={card} onDone={() => void load()} />)}</div> : null}
    {desk && desk.waiting ? <p className="ov-muted">{number.format(desk.waiting)} بطاقة أخرى تنتظر الملخص القادم.</p> : null}
    {desk ? <div className="ov-grid2" style={{ marginTop: 16 }}>
      <div>
        <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>متأخر عن موعده ({number.format(desk.overdue.length)})</h3>
        {desk.overdue.length ? <ul className="ov-list">{desk.overdue.slice(0, 8).map((item) => <li key={item.id}><strong>{item.subject.slice(0, 110)}</strong><span className="ov-muted">{item.label} · المسؤول الآن: {item.ownerName}</span><Link href={`/commands#${item.id}`} className="ov-muted">بطاقة المتابعة</Link></li>)}</ul> : <p className="ov-empty">لا أوامر متأخرة.</p>}
      </div>
      <div>
        <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>أُعيد للأقسام ({number.format(desk.returned.length)})</h3>
        {desk.returned.length ? <ul className="ov-list">{desk.returned.slice(0, 8).map((item) => <li key={item.id}><strong>{item.subject.slice(0, 90)}{item.duplicateCount > 1 ? ` (×${item.duplicateCount})` : ""}</strong><span className="ov-muted">{item.reason} · عند {item.holderName} · يُؤرشف {fmt(item.expiresAt)}</span></li>)}</ul> : <p className="ov-empty">لا شيء معاد للتصحيح.</p>}
      </div>
    </div> : null}
  </section>;
}
