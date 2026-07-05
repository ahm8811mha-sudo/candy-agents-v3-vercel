"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Inbox, PenLine, RefreshCcw, Send, ShieldCheck } from "lucide-react";

type Box = "INBOX" | "SENT" | "DRAFTS" | "ARCHIVED";

type Message = {
  id: string;
  reference: string;
  mailbox: Box | string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  status: string;
  contactType: "GOVERNMENT" | "COMPANY" | "INDIVIDUAL";
  createdAt: string;
};

type Ready = { database: boolean; realEmail: boolean; provider: string; fromEmail?: string | null; gmailReady?: boolean; missingGmailKeys?: string[] };

const boxes: Array<{ key: Box; label: string; description: string }> = [
  { key: "INBOX", label: "الوارد", description: "كل المخاطبات والرسائل القادمة إلى الشركة" },
  { key: "SENT", label: "الصادر", description: "كل الرسائل التي أرسلتها الشركة" },
  { key: "DRAFTS", label: "المسودات", description: "رسائل محفوظة ولم ترسل بعد" },
  { key: "ARCHIVED", label: "الأرشيف", description: "مخاطبات مغلقة ومحفوظة للرجوع إليها" },
];

const labels = { INBOX: "الوارد", SENT: "الصادر", DRAFTS: "المسودات", ARCHIVED: "الأرشيف" } as const;

function normalizeBox(value: string): Box {
  const v = value.toUpperCase();
  if (v === "SENT") return "SENT";
  if (v === "DRAFTS" || v === "DRAFT") return "DRAFTS";
  if (v === "ARCHIVED" || v === "ARCHIVE") return "ARCHIVED";
  return "INBOX";
}

export default function MailCenterApiPanel() {
  const [box, setBox] = useState<Box>("INBOX");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);
  const [notice, setNotice] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("طلب رسمي");
  const [bodyText, setBodyText] = useState("تحية طيبة،\n\nنأمل منكم التكرم بالإفادة بخصوص الطلب.\n\nمع الشكر،\nOrvanta");
  const [contactType, setContactType] = useState<"GOVERNMENT" | "COMPANY" | "INDIVIDUAL">("COMPANY");
  const mailboxRef = useRef<HTMLElement | null>(null);

  const normalizedMessages = useMemo(() => messages.map((m) => ({ ...m, mailbox: normalizeBox(String(m.mailbox)) })), [messages]);

  function currentList(target: Box) {
    return normalizedMessages.filter((m) => m.mailbox === target);
  }

  function openBox(nextBox: Box) {
    setBox(nextBox);
    const first = currentList(nextBox)[0];
    setSelectedId(first?.id || "");
    const url = new URL(window.location.href);
    url.searchParams.set("mailbox", nextBox.toLowerCase());
    window.history.replaceState({}, "", url.toString());
    setTimeout(() => mailboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function load() {
    const res = await fetch("/api/correspondence", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) {
      const loaded = json.messages || [];
      setMessages(loaded);
      setReady(json.readiness || null);
      const params = new URLSearchParams(window.location.search);
      const requested = normalizeBox(params.get("mailbox") || box);
      setBox(requested);
      const first = loaded.map((m: Message) => ({ ...m, mailbox: normalizeBox(String(m.mailbox)) })).find((m: Message) => m.mailbox === requested);
      if (!selectedId && first) setSelectedId(first.id);
    }
  }

  useEffect(() => {
    load().catch(() => setNotice("تعذر تحميل البريد."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/correspondence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json();
    if (json.messages) setMessages(json.messages);
    else await load();
    return json;
  }

  async function syncInbox() {
    const json = await post("sync", {});
    setNotice(json.ok ? `نتيجة مزامنة Gmail: ${json.synced || 0} رسالة. ${json.reason || ""}` : `تعذرت مزامنة Gmail. ${json.reason || ""}`);
    openBox("INBOX");
  }

  async function save() {
    const json = await post("save", { toEmail, subject, bodyText, contactType, needsApproval: false });
    setNotice(json.ok ? "تم حفظ المسودة." : "تعذر الحفظ.");
    openBox("DRAFTS");
  }

  async function send() {
    const json = await post("send", { toEmail, subject, bodyText, contactType, needsApproval: false });
    setNotice(json.sent ? "تم الإرسال مباشرة عبر Gmail." : `لم يتم الإرسال: ${json.reason || "سبب غير معروف"}`);
    openBox(json.sent ? "SENT" : "DRAFTS");
  }

  async function archive(id: string) {
    const json = await post("archive", { id });
    setNotice(json.ok ? "تمت الأرشفة." : "تعذر الأرشفة.");
    openBox("ARCHIVED");
  }

  const list = currentList(box);
  const selected = normalizedMessages.find((m) => m.id === selectedId) || list[0];
  const missing = ready?.missingGmailKeys?.length ? ` · ناقص: ${ready.missingGmailKeys.join(", ")}` : "";
  const active = boxes.find((item) => item.key === box) || boxes[0];

  return (
    <>
      <section className="bento-grid">
        {boxes.map((b) => (
          <button key={b.key} className={`bento-card ${box === b.key ? "bento-card--green" : ""}`} onClick={() => openBox(b.key)}>
            <span className="bento-kicker"><Inbox size={15} /> {b.label}</span>
            <span className="bento-value">{currentList(b.key).length}</span>
            <span className="bento-label">اضغط لفتح {b.label}</span>
          </button>
        ))}
        <div className={`bento-card ${ready?.realEmail ? "bento-card--green" : "bento-card--amber"}`}><span className="bento-kicker"><ShieldCheck size={15} /> الجاهزية</span><span className="bento-value">{ready?.realEmail ? "Live" : "Setup"}</span><span className="bento-label">{ready?.database ? "DB جاهزة" : "شغل SQL"} · {ready?.provider || "Provider"}{missing}</span></div>
      </section>

      {notice && <section className="bento-card bento-full"><strong>{notice}</strong></section>}

      <section ref={mailboxRef} className="ops-workbench" style={{ gridTemplateColumns: "minmax(300px,.9fr) minmax(0,1.1fr)" }}>
        <div className="ops-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2>صندوق {active.label}</h2>
              <p style={{ color: "var(--muted)", margin: 0 }}>{active.description}</p>
            </div>
            <div className="dashboard-actions">
              <button className="secondary-btn btn-sm" onClick={load}><RefreshCcw size={14} /> تحديث</button>
              {box === "INBOX" && <button className="primary-btn btn-sm" onClick={syncInbox}><RefreshCcw size={14} /> مزامنة Gmail</button>}
            </div>
          </div>

          <div className="section-tabs" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginTop: 14 }}>
            {boxes.map((b) => <button key={b.key} className={`section-tab ${box === b.key ? "active" : ""}`} onClick={() => openBox(b.key)}>{b.label}</button>)}
          </div>

          <div className="bento-list" style={{ marginTop: 14 }}>
            {list.map((m) => (
              <button key={m.id} className="bento-list__row" onClick={() => setSelectedId(m.id)} style={{ textAlign: "start", borderColor: selected?.id === m.id ? "rgba(20,184,166,.55)" : undefined }}>
                <span><b style={{ color: "var(--text-strong)" }}>{m.subject}</b><br /><small>{m.fromEmail} → {m.toEmail}</small></span>
                <span className="mini-pill">{m.status}</span>
              </button>
            ))}
            {list.length === 0 && <div className="department-empty">لا توجد رسائل في صندوق {active.label}.</div>}
          </div>
        </div>

        <div className="ops-card document-editor">
          <h2>قراءة الرسالة</h2>
          {selected ? <><div className="statement-row strong"><span>المرجع</span><b>{selected.reference}</b></div><pre className="final-result" style={{ minHeight: 260 }}>{selected.bodyText}</pre><div className="dashboard-actions"><button className="secondary-btn" onClick={() => archive(selected.id)}><Archive size={16} /> أرشفة</button></div></> : <div className="department-empty">اختر رسالة من صندوق {active.label}.</div>}
        </div>
      </section>

      <section className="ops-workbench">
        <div className="ops-card"><h2>إنشاء صادر</h2><label>المستلم<input className="input" value={toEmail} onChange={(e) => setToEmail(e.target.value)} /></label><label>الموضوع<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>النوع<select className="input" value={contactType} onChange={(e) => setContactType(e.target.value as typeof contactType)}><option value="GOVERNMENT">جهة رسمية</option><option value="COMPANY">شركة</option><option value="INDIVIDUAL">فرد</option></select></label><label>النص<textarea className="textarea" value={bodyText} onChange={(e) => setBodyText(e.target.value)} /></label></div>
        <div className="ops-card document-editor"><h2>معاينة</h2><pre className="final-result" style={{ minHeight: 250 }}>{bodyText}</pre><div className="dashboard-actions"><button className="primary-btn" onClick={send}><Send size={16} /> إرسال مباشر</button><button className="secondary-btn" onClick={save}><PenLine size={16} /> حفظ مسودة</button></div></div>
      </section>
    </>
  );
}
