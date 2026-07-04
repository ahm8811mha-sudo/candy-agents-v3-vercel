"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Building2,
  CheckCircle2,
  Copy,
  FileText,
  Inbox,
  Mail,
  PenLine,
  Search,
  Send,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

type Mailbox = "inbox" | "sent" | "drafts" | "archived";
type TemplateKey = "official" | "company" | "individual" | "complaint" | "followup" | "thanks";
type ContactType = "جهة رسمية" | "شركة" | "فرد";

type Letter = {
  id: string;
  box: Mailbox;
  from: string;
  to: string;
  contactType: ContactType;
  subject: string;
  body: string;
  status: string;
  date: string;
  priority?: "عادي" | "مهم" | "عاجل";
  unread?: boolean;
};

const templates: Record<TemplateKey, { label: string; icon: typeof Mail; subject: string; opener: string; tone: string; contactType: ContactType }> = {
  official: { label: "خطاب جهة رسمية", icon: ShieldCheck, subject: "طلب رسمي", opener: "سعادة/ الجهة المختصة،", tone: "رسمي ومباشر", contactType: "جهة رسمية" },
  company: { label: "مخاطبة شركة", icon: Building2, subject: "طلب تعاون أو إفادة", opener: "السادة/ إدارة الشركة المحترمين،", tone: "مهني وتجاري", contactType: "شركة" },
  individual: { label: "مخاطبة فرد", icon: Users, subject: "طلب أو توضيح", opener: "الأستاذ/ة الكريم/ة،", tone: "واضح ومحترم", contactType: "فرد" },
  complaint: { label: "شكوى أو اعتراض", icon: FileText, subject: "شكوى رسمية", opener: "سعادة/ الجهة المختصة،", tone: "حازم ومنضبط", contactType: "جهة رسمية" },
  followup: { label: "متابعة معاملة", icon: Mail, subject: "متابعة طلب سابق", opener: "سعادة/ الجهة المختصة،", tone: "رسمي مختصر", contactType: "جهة رسمية" },
  thanks: { label: "شكر وتقدير", icon: Star, subject: "شكر وتقدير", opener: "السادة الكرام،", tone: "راقي ومهني", contactType: "شركة" },
};

const seedLetters: Letter[] = [
  {
    id: "in-001",
    box: "inbox",
    from: "وزارة التجارة",
    to: "Orvanta",
    contactType: "جهة رسمية",
    subject: "إفادة بخصوص طلب سابق",
    body: "وردنا طلبكم، ونأمل تزويدنا بالمستندات المطلوبة لاستكمال الإجراء.",
    status: "وارد جديد",
    date: "اليوم 09:30",
    priority: "مهم",
    unread: true,
  },
  {
    id: "in-002",
    box: "inbox",
    from: "شركة موردين الخليج",
    to: "Orvanta",
    contactType: "شركة",
    subject: "عرض أسعار محدث",
    body: "نرفق لكم عرض الأسعار المحدث، ونأمل مراجعة البنود والرد خلال هذا الأسبوع.",
    status: "بانتظار رد",
    date: "أمس 16:10",
    priority: "عادي",
  },
  {
    id: "sent-001",
    box: "sent",
    from: "Orvanta",
    to: "شركة موردين الخليج",
    contactType: "شركة",
    subject: "طلب إعادة جدولة دفعة",
    body: "نأمل منكم دراسة إعادة جدولة الدفعة المستحقة وتزويدنا بالخيارات المتاحة.",
    status: "مرسل",
    date: "أمس 12:20",
    priority: "مهم",
  },
  {
    id: "draft-001",
    box: "drafts",
    from: "Orvanta",
    to: "جهة رسمية",
    contactType: "جهة رسمية",
    subject: "مسودة خطاب رسمي",
    body: "هذه مسودة خطاب رسمي قابلة للتعديل قبل الإرسال أو الاعتماد.",
    status: "مسودة",
    date: "محفوظة",
    priority: "عادي",
  },
];

function buildDraft(template: TemplateKey, to: string, subject: string, details: string, sender: string) {
  const t = templates[template];
  const finalSubject = subject.trim() || t.subject;
  const body = `${t.opener}\n\nتحية طيبة،\n\nنأمل منكم التكرم بالنظر في الموضوع التالي:\n\n${details.trim() || "اكتب هنا تفاصيل المخاطبة والطلب المطلوب."}\n\nونأمل إفادتنا بما يلزم أو توجيهنا للإجراء المناسب.\n\nمع خالص الشكر والتقدير،\n${sender.trim() || "Orvanta"}`;
  return { subject: finalSubject, body, to: to.trim() || "الجهة المستلمة" };
}

export default function CorrespondenceCenterPage() {
  const [box, setBox] = useState<Mailbox>("inbox");
  const [letters, setLetters] = useState<Letter[]>(seedLetters);
  const [selectedId, setSelectedId] = useState(seedLetters[0].id);
  const [query, setQuery] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("official");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("Orvanta");
  const [details, setDetails] = useState("نرغب بمخاطبتكم بخصوص طلب أو إجراء رسمي ونأمل منكم التكرم بالإفادة.");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("orvanta-correspondence");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Letter[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLetters(parsed);
          setSelectedId(parsed[0].id);
        }
      } catch {
        // keep seed data
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("orvanta-correspondence", JSON.stringify(letters));
  }, [letters]);

  const draft = useMemo(() => buildDraft(template, recipient, subject, details, sender), [template, recipient, subject, details, sender]);
  const currentList = letters.filter((item) => {
    const matchesBox = item.box === box;
    const haystack = `${item.from} ${item.to} ${item.subject} ${item.body} ${item.contactType}`.toLowerCase();
    return matchesBox && haystack.includes(query.toLowerCase());
  });
  const selected = letters.find((item) => item.id === selectedId) || currentList[0] || letters[0];

  const counts = {
    inbox: letters.filter((x) => x.box === "inbox").length,
    sent: letters.filter((x) => x.box === "sent").length,
    drafts: letters.filter((x) => x.box === "drafts").length,
    archived: letters.filter((x) => x.box === "archived").length,
  };

  async function copyDraft() {
    await navigator.clipboard.writeText(`الموضوع: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function saveDraft() {
    const item: Letter = {
      id: `draft-${Date.now()}`,
      box: "drafts",
      from: sender || "Orvanta",
      to: draft.to,
      contactType: templates[template].contactType,
      subject: draft.subject,
      body: draft.body,
      status: "مسودة",
      date: "الآن",
      priority: "عادي",
    };
    setLetters((prev) => [item, ...prev]);
    setBox("drafts");
    setSelectedId(item.id);
  }

  function sendLetter() {
    const item: Letter = {
      id: `sent-${Date.now()}`,
      box: "sent",
      from: sender || "Orvanta",
      to: draft.to,
      contactType: templates[template].contactType,
      subject: draft.subject,
      body: draft.body,
      status: "مرسل من مركز المخاطبات",
      date: "الآن",
      priority: "مهم",
    };
    setLetters((prev) => [item, ...prev]);
    setBox("sent");
    setSelectedId(item.id);
  }

  function archiveSelected() {
    if (!selected) return;
    setLetters((prev) => prev.map((item) => item.id === selected.id ? { ...item, box: "archived", status: "مؤرشف", unread: false } : item));
    setBox("archived");
  }

  const tabs: Array<{ key: Mailbox; label: string; icon: typeof Inbox; count: number }> = [
    { key: "inbox", label: "الوارد", icon: Inbox, count: counts.inbox },
    { key: "sent", label: "الصادر", icon: Send, count: counts.sent },
    { key: "drafts", label: "المسودات", icon: PenLine, count: counts.drafts },
    { key: "archived", label: "الأرشيف", icon: Archive, count: counts.archived },
  ];

  return (
    <main className="page-wrap">
      <section className="hero-scenic" style={{ textAlign: "start", justifyItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <OrvantaLogo size={54} subtitle="Correspondence Center" />
          <span className="hero-pill"><Mail size={14} /> مركز المخاطبات · وارد وصادر رسمي</span>
        </div>
        <h1 className="hero-title" style={{ maxWidth: "none" }}>Email-style Correspondence<br />مركز بريد للشركة و<em>المخاطبات الرسمية</em></h1>
        <p className="hero-sub" style={{ maxWidth: 820 }}>واجهة واحدة لاستقبال المخاطبات الواردة، إنشاء الصادر، حفظ المسودات، استخدام نماذج رسمية، ومتابعة التواصل مع الجهات الرسمية والشركات والأفراد.</p>
      </section>

      <section className="bento-grid">
        <div className="bento-card bento-card--green"><span className="bento-kicker"><Inbox size={15} /> الوارد</span><span className="bento-value">{counts.inbox}</span><span className="bento-label">رسائل ومخاطبات واردة</span></div>
        <div className="bento-card"><span className="bento-kicker"><Send size={15} /> الصادر</span><span className="bento-value">{counts.sent}</span><span className="bento-label">مخاطبات مرسلة</span></div>
        <div className="bento-card"><span className="bento-kicker"><PenLine size={15} /> المسودات</span><span className="bento-value">{counts.drafts}</span><span className="bento-label">جاهزة للمراجعة</span></div>
        <div className="bento-card bento-card--amber"><span className="bento-kicker"><ShieldCheck size={15} /> الاعتماد</span><span className="bento-value">Owner</span><span className="bento-label">المخاطبات الحساسة تعرض للاعتماد</span></div>
      </section>

      <section className="ops-workbench" style={{ gridTemplateColumns: "300px minmax(0, 1fr) minmax(320px, .9fr)" }}>
        <aside className="ops-card" style={{ gap: 12 }}>
          <h2>صناديق البريد</h2>
          <div className="section-tabs" style={{ display: "grid" }}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return <button key={tab.key} className={`section-tab ${box === tab.key ? "active" : ""}`} onClick={() => setBox(tab.key)}><Icon size={15} /> {tab.label}<span className="mini-pill">{tab.count}</span></button>;
            })}
          </div>
          <div className="input" style={{ display: "flex", alignItems: "center", gap: 8 }}><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث في المخاطبات" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "inherit" }} /></div>

          <h2 style={{ marginTop: 8 }}>نماذج سريعة</h2>
          <div className="quick-nav" style={{ gridTemplateColumns: "1fr" }}>
            {(Object.keys(templates) as TemplateKey[]).map((key) => {
              const item = templates[key];
              const Icon = item.icon;
              return <button key={key} className="quick-nav-card" onClick={() => setTemplate(key)} style={{ alignItems: "start", textAlign: "start", borderColor: template === key ? "rgba(20,184,166,.55)" : undefined }}><span><Icon size={16} /></span><strong>{item.label}</strong><small>{item.tone}</small></button>;
            })}
          </div>
        </aside>

        <section className="ops-card" style={{ gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <h2>{tabs.find((tab) => tab.key === box)?.label}</h2>
            <span className="mini-pill">{currentList.length}</span>
          </div>
          <div className="bento-list">
            {currentList.map((item) => (
              <button key={item.id} className="bento-list__row" onClick={() => setSelectedId(item.id)} style={{ textAlign: "start", borderColor: selected?.id === item.id ? "rgba(20,184,166,.55)" : undefined }}>
                <span style={{ display: "grid", gap: 5 }}>
                  <b style={{ color: item.unread ? "var(--text-strong)" : "var(--text)", lineHeight: 1.5 }}>{item.subject}</b>
                  <small style={{ color: "var(--muted)" }}>{box === "sent" ? `إلى: ${item.to}` : `من: ${item.from}`} · {item.date}</small>
                </span>
                <span className={`mini-pill ${item.priority === "عاجل" ? "high" : item.priority === "مهم" ? "pending" : "done"}`}>{item.status}</span>
              </button>
            ))}
            {currentList.length === 0 && <div className="department-empty">لا توجد مخاطبات في هذا الصندوق.</div>}
          </div>
        </section>

        <section className="ops-card document-editor" style={{ gap: 12 }}>
          <h2>قراءة المخاطبة</h2>
          {selected && <>
            <div className="statement-row strong"><span>الموضوع</span><b>{selected.subject}</b></div>
            <div className="statement-list">
              <div className="statement-row"><span>من</span><b>{selected.from}</b></div>
              <div className="statement-row"><span>إلى</span><b>{selected.to}</b></div>
              <div className="statement-row"><span>النوع</span><b>{selected.contactType}</b></div>
            </div>
            <pre className="final-result" style={{ minHeight: 190 }}>{selected.body}</pre>
            <div className="dashboard-actions">
              <button className="secondary-btn" onClick={archiveSelected}><Archive size={16} /> أرشفة</button>
              <Link className="secondary-btn" href="/inbox"><ShieldCheck size={16} /> تحويل للاعتماد</Link>
            </div>
          </>}
        </section>
      </section>

      <section className="ops-workbench">
        <div className="ops-card">
          <h2>إنشاء مخاطبة صادرة</h2>
          <label>البريد أو الجهة المستلمة<input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="example@entity.gov.sa" /></label>
          <label>الموضوع<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={templates[template].subject} /></label>
          <label>اسم المرسل<input className="input" value={sender} onChange={(e) => setSender(e.target.value)} /></label>
          <label>تفاصيل الطلب<textarea className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} /></label>
        </div>

        <div className="ops-card document-editor">
          <h2>معاينة الرسالة</h2>
          <div className="statement-row strong"><span>الموضوع</span><b>{draft.subject}</b></div>
          <pre className="final-result" style={{ minHeight: 300 }}>{draft.body}</pre>
          <div className="dashboard-actions">
            <button className="primary-btn" onClick={sendLetter}><Send size={16} /> إرسال داخلي</button>
            <button className="secondary-btn" onClick={saveDraft}><PenLine size={16} /> حفظ مسودة</button>
            <button className="secondary-btn" onClick={copyDraft}><Copy size={16} /> {copied ? "تم النسخ" : "نسخ"}</button>
          </div>
        </div>
      </section>

      <section className="bento-card bento-full bento-card--glow" style={{ gap: 10 }}>
        <span className="bento-kicker"><CheckCircle2 size={15} /> جاهز للربط الحقيقي</span>
        <strong style={{ color: "var(--text-strong)", lineHeight: 1.8 }}>هذه واجهة مركز بريد ومخاطبات داخلية. استقبال وإرسال البريد الحقيقي من دومين الشركة يحتاج ربط Gmail API أو SMTP وإضافة مفاتيح البريد في إعدادات Vercel.</strong>
      </section>
    </main>
  );
}
