"use client";

import { useEffect, useState } from "react";
import { Archive, Inbox, PenLine, RefreshCcw, Send, ShieldCheck } from "lucide-react";

type Message = {
  id: string;
  reference: string;
  mailbox: "INBOX" | "SENT" | "DRAFTS" | "ARCHIVED";
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  status: string;
  contactType: "GOVERNMENT" | "COMPANY" | "INDIVIDUAL";
  createdAt: string;
};

type Ready = { database: boolean; realEmail: boolean; provider: string; fromEmail?: string | null };

const boxes = ["INBOX", "SENT", "DRAFTS", "ARCHIVED"] as const;
const labels = { INBOX: "الوارد", SENT: "الصادر", DRAFTS: "المسودات", ARCHIVED: "الأرشيف" } as const;

export default function MailCenterApiPanel() {
  const [box, setBox] = useState<(typeof boxes)[number]>("INBOX");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);
  const [notice, setNotice] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("طلب رسمي");
  const [bodyText, setBodyText] = useState("تحية طيبة،\n\nنأمل منكم التكرم بالإفادة بخصوص الطلب.\n\nمع الشكر،\nOrvanta");
  const [contactType, setContactType] = useState<"GOVERNMENT" | "COMPANY" | "INDIVIDUAL">("GOVERNMENT");

  async function load() {
    const res = await fetch("/api/correspondence", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) {
      setMessages(json.messages || []);
      setReady(json.readiness || null);
      if (!selectedId && json.messages?.[0]) setSelectedId(json.messages[0].id);
    }
  }

  useEffect(() => {
    load().catch(() => setNotice("تعذر تحميل البريد."));
  }, []);

  async function post(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/correspondence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json();
    await load();
    return json;
  }

  async function save() {
    const json = await post("save", { toEmail, subject, bodyText, contactType, needsApproval: contactType === "GOVERNMENT" });
    setNotice(json.ok ? "تم حفظ المسودة." : "تعذر الحفظ.");
    setBox("DRAFTS");
  }

  async function send() {
    const json = await post("send", { toEmail, subject, bodyText, contactType, needsApproval: contactType === "GOVERNMENT" });
    setNotice(json.sent ? "تم الإرسال." : json.reason === "PENDING_APPROVAL" ? "تم تحويلها للاعتماد." : "مزود البريد غير مهيأ بعد.");
    setBox(json.sent ? "SENT" : "DRAFTS");
  }

  async function archive(id: string) {
    const json = await post("archive", { id });
    setNotice(json.ok ? "تمت الأرشفة." : "تعذر الأرشفة.");
    setBox("ARCHIVED");
  }

  async function approve(id: string) {
    const json = await post("approve", { id, approvedBy: "Owner" });
    setNotice(json.ok ? "تم الاعتماد." : "تعذر الاعتماد.");
  }

  const list = messages.filter((m) => m.mailbox === box);
  const selected = messages.find((m) => m.id === selectedId) || list[0];

  return (
    <>
      <section className="bento-grid">
        {boxes.map((b) => <button key={b} className={`bento-card ${box === b ? "bento-card--green" : ""}`} onClick={() => setBox(b)}><span className="bento-kicker"><Inbox size={15} /> {labels[b]}</span><span className="bento-value">{messages.filter((m) => m.mailbox === b).length}</span><span className="bento-label">صندوق {labels[b]}</span></button>)}
        <div className={`bento-card ${ready?.realEmail ? "bento-card--green" : "bento-card--amber"}`}><span className="bento-kicker"><ShieldCheck size={15} /> الجاهزية</span><span className="bento-value">{ready?.realEmail ? "Live" : "Setup"}</span><span className="bento-label">{ready?.database ? "DB جاهزة" : "شغل SQL"} · {ready?.provider || "Provider"}</span></div>
      </section>
      {notice && <section className="bento-card bento-full"><strong>{notice}</strong></section>}
      <section className="ops-workbench" style={{ gridTemplateColumns: "minmax(260px,.8fr) minmax(0,1fr)" }}>
        <div className="ops-card"><h2>{labels[box]}</h2><button className="secondary-btn btn-sm" onClick={load}><RefreshCcw size={14} /> تحديث</button><div className="bento-list">{list.map((m) => <button key={m.id} className="bento-list__row" onClick={() => setSelectedId(m.id)}><span><b style={{ color: "var(--text-strong)" }}>{m.subject}</b><br /><small>{m.fromEmail} → {m.toEmail}</small></span><span className="mini-pill">{m.status}</span></button>)}</div></div>
        <div className="ops-card document-editor"><h2>قراءة الرسالة</h2>{selected ? <><div className="statement-row strong"><span>المرجع</span><b>{selected.reference}</b></div><pre className="final-result" style={{ minHeight: 220 }}>{selected.bodyText}</pre><div className="dashboard-actions"><button className="secondary-btn" onClick={() => approve(selected.id)}><ShieldCheck size={16} /> اعتماد</button><button className="secondary-btn" onClick={() => archive(selected.id)}><Archive size={16} /> أرشفة</button></div></> : <div className="department-empty">لا توجد رسائل.</div>}</div>
      </section>
      <section className="ops-workbench">
        <div className="ops-card"><h2>إنشاء صادر</h2><label>المستلم<input className="input" value={toEmail} onChange={(e) => setToEmail(e.target.value)} /></label><label>الموضوع<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>النوع<select className="input" value={contactType} onChange={(e) => setContactType(e.target.value as typeof contactType)}><option value="GOVERNMENT">جهة رسمية</option><option value="COMPANY">شركة</option><option value="INDIVIDUAL">فرد</option></select></label><label>النص<textarea className="textarea" value={bodyText} onChange={(e) => setBodyText(e.target.value)} /></label></div>
        <div className="ops-card document-editor"><h2>معاينة</h2><pre className="final-result" style={{ minHeight: 250 }}>{bodyText}</pre><div className="dashboard-actions"><button className="primary-btn" onClick={send}><Send size={16} /> إرسال</button><button className="secondary-btn" onClick={save}><PenLine size={16} /> حفظ مسودة</button></div></div>
      </section>
    </>
  );
}
