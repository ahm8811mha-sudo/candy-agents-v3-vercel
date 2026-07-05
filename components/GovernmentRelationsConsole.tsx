"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";

type Doc = {
  id: string;
  title: string;
  issuer?: string | null;
  document_number?: string | null;
  tax_number?: string | null;
  expiry_date?: string | null;
  status: string;
  missing_fields?: string[];
  extraction_confidence?: number;
};

const documentTypes = [
  ["COMMERCIAL_REGISTRATION", "السجل التجاري"],
  ["VAT_CERTIFICATE", "شهادة ضريبة القيمة المضافة"],
  ["ZAKAT_TAX_CERTIFICATE", "شهادة الزكاة والضريبة"],
  ["CHAMBER_SUBSCRIPTION", "اشتراك الغرفة التجارية"],
  ["MUNICIPAL_LICENSE", "الرخصة البلدية"],
  ["WORK_PERMIT", "رخصة العمل"],
  ["OTHER_GOVERNMENT_DOCUMENT", "وثيقة أخرى"],
];

export default function GovernmentRelationsConsole() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setWorking(true);
    setError("");
    try {
      const res = await fetch("/api/government-relations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Load failed");
      setDocs(json.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setWorking(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("اختر ملف أولاً.");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = await readFilePayload(file);
      const res = await fetch("/api/government-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload-document",
          data: {
            documentType: String(form.get("documentType") || ""),
            issuer: String(form.get("issuer") || ""),
            title: String(form.get("title") || ""),
            notes: String(form.get("notes") || ""),
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            ...payload,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      const confidence = Math.round(Number(json.result?.document?.extraction_confidence || 0) * 100);
      const missing = json.result?.document?.missing_fields?.length || 0;
      setMessage(missing ? `تم الرفع. الاستخراج ${confidence}% ويوجد ${missing} حقل ناقص.` : `تم الرفع والاستخراج ${confidence}%.`);
      setFile(null);
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <span className="eyebrow">Documents</span>
          <h1>العلاقات الحكومية</h1>
          <p>ارفع PDF أو صورة، وسيحاول النظام استخراج البيانات وحفظ الوثيقة.</p>
        </div>
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" type="button" onClick={load} disabled={working}>
          {working ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />} تحديث
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submit}>
          <span className="eyebrow"><Upload size={16} /> رفع وثيقة</span>
          <h2>رفع وتحليل الوثيقة</h2>
          <p className="muted">تم تعديل السيرفر ليحاول استخراج نص PDF قبل التحليل. إذا كان الملف ممسوحًا كصورة، أضف الرقم أو التاريخ في الملاحظة.</p>
          <label>نوع الوثيقة<select className="input" name="documentType" defaultValue="COMMERCIAL_REGISTRATION">{documentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>الجهة المصدرة<input className="input" name="issuer" placeholder="وزارة التجارة" /></label>
          <label>اسم الوثيقة<input className="input" name="title" placeholder="السجل التجاري" /></label>
          <label>الملف<input className="input" type="file" accept="image/*,.pdf,.txt,.csv,.json" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          <label>ملاحظة أو نص<textarea className="textarea compact" name="notes" placeholder="اكتب الرقم أو التاريخ إذا كان ظاهرًا" /></label>
          <button className="primary-btn" disabled={working}>{working ? <Loader2 className="spin" size={18} /> : <Upload size={18} />} رفع وتحليل</button>
        </form>
      </section>

      <section className="ops-board two">
        <section className="department-board-column">
          <header><h2>الوثائق</h2><span>{docs.length}</span></header>
          <div>
            {docs.length === 0 && <p className="department-empty">لا توجد وثائق بعد.</p>}
            {docs.map((doc) => (
              <article className="department-row" key={doc.id}>
                <div>
                  <span className="mini-pill">{doc.status}</span>
                  <strong>{doc.title}</strong>
                  <p>{doc.issuer || "جهة غير محددة"} · {doc.document_number || doc.tax_number || "رقم غير مستخرج"}</p>
                  <small>الثقة {Math.round(Number(doc.extraction_confidence || 0) * 100)}% · النواقص {doc.missing_fields?.length || 0}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

async function readFilePayload(file: File) {
  const isText = file.type.startsWith("text/") || /\.(txt|csv|json)$/i.test(file.name);
  if (isText) return { fileText: await readAsText(file) };
  const dataUrl = await readAsDataUrl(file);
  return { fileBase64: dataUrl.split(",")[1] || "" };
}

function readAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsText(file);
  });
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
}
