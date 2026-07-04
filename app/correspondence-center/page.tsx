"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Copy, FileText, Mail, Send, ShieldCheck, Users } from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

type TemplateKey = "official" | "company" | "individual" | "complaint" | "followup" | "thanks";

const templates: Record<TemplateKey, { label: string; icon: typeof Mail; subject: string; opener: string; tone: string }> = {
  official: { label: "خطاب جهة رسمية", icon: ShieldCheck, subject: "طلب رسمي", opener: "سعادة/ الجهة المختصة،", tone: "رسمي ومباشر" },
  company: { label: "مخاطبة شركة", icon: Building2, subject: "طلب تعاون أو إفادة", opener: "السادة/ إدارة الشركة المحترمين،", tone: "مهني وتجاري" },
  individual: { label: "مخاطبة فرد", icon: Users, subject: "طلب أو توضيح", opener: "الأستاذ/ة الكريم/ة،", tone: "واضح ومحترم" },
  complaint: { label: "شكوى أو اعتراض", icon: FileText, subject: "شكوى رسمية", opener: "سعادة/ الجهة المختصة،", tone: "حازم ومنضبط" },
  followup: { label: "متابعة معاملة", icon: Mail, subject: "متابعة طلب سابق", opener: "سعادة/ الجهة المختصة،", tone: "رسمي مختصر" },
  thanks: { label: "شكر وتقدير", icon: Mail, subject: "شكر وتقدير", opener: "السادة الكرام،", tone: "راقي ومهني" },
};

function buildDraft(template: TemplateKey, recipient: string, subject: string, details: string, sender: string) {
  const t = templates[template];
  const finalSubject = subject.trim() || t.subject;
  return {
    subject: finalSubject,
    body: `${t.opener}\n\nتحية طيبة،\n\nنأمل منكم التكرم بالنظر في الموضوع التالي:\n\n${details.trim() || "اكتب هنا تفاصيل المخاطبة والطلب المطلوب تنفيذه."}\n\nونأمل إفادتنا بما يلزم أو توجيهنا للإجراء المناسب.\n\nمع خالص الشكر والتقدير،\n${sender.trim() || "Orvanta"}`,
    mailto: `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(`${t.opener}\n\nتحية طيبة،\n\n${details.trim() || "تفاصيل المخاطبة"}\n\nمع خالص الشكر،\n${sender.trim() || "Orvanta"}`)}`,
  };
}

export default function CorrespondenceCenterPage() {
  const [template, setTemplate] = useState<TemplateKey>("official");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("Orvanta");
  const [details, setDetails] = useState("نرغب بمخاطبتكم بخصوص طلب أو إجراء رسمي ونأمل منكم التكرم بالإفادة.");
  const [copied, setCopied] = useState(false);

  const draft = useMemo(() => buildDraft(template, recipient, subject, details, sender), [template, recipient, subject, details, sender]);

  async function copyDraft() {
    await navigator.clipboard.writeText(`الموضوع: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="page-wrap">
      <section className="hero-scenic" style={{ textAlign: "start", justifyItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <OrvantaLogo size={54} subtitle="Correspondence Center" />
          <span className="hero-pill"><Mail size={14} /> مركز المخاطبات · نماذج خطابات وإيميلات</span>
        </div>
        <h1 className="hero-title" style={{ maxWidth: "none" }}>Correspondence Center<br />مركز موحد لكل <em>المخاطبات</em></h1>
        <p className="hero-sub" style={{ maxWidth: 780 }}>اكتب طلبك مرة واحدة، واختر النموذج المناسب للجهات الرسمية أو الشركات أو الأفراد. النظام يولد مسودة جاهزة للنسخ أو الإرسال عبر البريد.</p>
        <div className="hero-actions" style={{ justifyContent: "flex-start" }}>
          <a className="primary-btn" href={draft.mailto}><Send size={17} /> فتح في البريد</a>
          <button className="secondary-btn" onClick={copyDraft}><Copy size={17} /> {copied ? "تم النسخ" : "نسخ المسودة"}</button>
        </div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 14 }}>
        <span className="bento-kicker"><FileText size={15} /> النماذج الجاهزة</span>
        <div className="quick-nav">
          {(Object.keys(templates) as TemplateKey[]).map((key) => {
            const item = templates[key];
            const Icon = item.icon;
            return (
              <button key={key} className="quick-nav-card" style={{ borderColor: template === key ? "rgba(20,184,166,.55)" : undefined }} onClick={() => setTemplate(key)}>
                <span><Icon size={18} /></span>
                <strong>{item.label}</strong>
                <small>{item.tone}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ops-workbench">
        <div className="ops-card">
          <h2>بيانات المخاطبة</h2>
          <label>البريد أو الجهة المستلمة<input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="example@entity.gov.sa" /></label>
          <label>الموضوع<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={templates[template].subject} /></label>
          <label>اسم المرسل<input className="input" value={sender} onChange={(e) => setSender(e.target.value)} /></label>
          <label>تفاصيل الطلب<textarea className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} /></label>
        </div>

        <div className="ops-card document-editor">
          <h2>المسودة النهائية</h2>
          <div className="statement-row strong"><span>الموضوع</span><b>{draft.subject}</b></div>
          <pre className="final-result" style={{ minHeight: 320 }}>{draft.body}</pre>
          <div className="dashboard-actions">
            <button className="primary-btn" onClick={copyDraft}><Copy size={16} /> {copied ? "تم النسخ" : "نسخ"}</button>
            <a className="secondary-btn" href={draft.mailto}><Mail size={16} /> فتح البريد</a>
            <Link className="secondary-btn" href="/inbox"><ShieldCheck size={16} /> إرسال للاعتماد</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
