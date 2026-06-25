"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileBadge2,
  FileSearch,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";

type GovernmentDocument = {
  id: string;
  document_type: string;
  title: string;
  document_number?: string | null;
  issuer?: string | null;
  owner_name?: string | null;
  tax_number?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
  renewal_date?: string | null;
  city?: string | null;
  activity?: string | null;
  status: string;
  official_url?: string | null;
  renewal_url?: string | null;
  fee_amount?: number | null;
  fee_currency?: string | null;
  fee_text?: string | null;
  missing_fields?: string[];
  extraction_confidence?: number;
  created_at?: string;
};

type FeeSource = {
  id: string;
  document_type: string;
  issuer: string;
  service_name: string;
  official_url: string;
  renewal_url: string;
  fee_amount?: number | null;
  fee_currency?: string | null;
  fee_text: string;
  last_checked_at?: string | null;
  last_checked_status?: string | null;
  source_confidence?: string | null;
};

type RenewalTask = {
  id: string;
  document_id: string;
  title: string;
  due_date?: string | null;
  priority: string;
  status: string;
  fee_amount?: number | null;
  official_url?: string | null;
  renewal_url?: string | null;
};

type GovernmentData = {
  ok: boolean;
  documents: GovernmentDocument[];
  files: Array<{
    id: string;
    document_id: string;
    file_name: string;
    mime_type?: string | null;
    file_size?: number;
    file_category?: string | null;
    version_no?: number;
    is_current?: boolean;
  }>;
  fees: FeeSource[];
  tasks: RenewalTask[];
  integrations: Array<{ id: string; provider: string; status: string }>;
  accessLogs: Array<{ id: string; action: string; actor_role: string; created_at: string }>;
  metrics: {
    totalDocuments: number;
    activeDocuments: number;
    expiringSoon: number;
    expired: number;
    missingData: number;
    totalEstimatedFees: number;
    readyPortals: number;
    lastCheckedSources: number;
  };
};

const emptyData: GovernmentData = {
  ok: true,
  documents: [],
  files: [],
  fees: [],
  tasks: [],
  integrations: [],
  accessLogs: [],
  metrics: {
    totalDocuments: 0,
    activeDocuments: 0,
    expiringSoon: 0,
    expired: 0,
    missingData: 0,
    totalEstimatedFees: 0,
    readyPortals: 0,
    lastCheckedSources: 0,
  },
};

const documentTypes = [
  ["COMMERCIAL_REGISTRATION", "السجل التجاري"],
  ["VAT_CERTIFICATE", "شهادة ضريبة القيمة المضافة"],
  ["ZAKAT_TAX_CERTIFICATE", "شهادة الزكاة والضريبة"],
  ["CHAMBER_SUBSCRIPTION", "اشتراك الغرفة التجارية"],
  ["MUNICIPAL_LICENSE", "الرخصة البلدية"],
  ["WORK_PERMIT", "رخصة العمل"],
  ["INVESTMENT_LICENSE", "ترخيص الاستثمار"],
  ["OTHER_GOVERNMENT_DOCUMENT", "وثيقة حكومية أخرى"],
];

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function GovernmentRelationsConsole() {
  const [data, setData] = useState<GovernmentData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const nextTasks = useMemo(
    () => data.tasks.filter((task) => task.status !== "DONE").slice(0, 6),
    [data.tasks]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/government-relations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل إدارة العلاقات الحكومية.");
      setData({
        ok: true,
        documents: json.documents || [],
        files: json.files || [],
        fees: json.fees || [],
        tasks: json.tasks || [],
        integrations: json.integrations || [],
        accessLogs: json.accessLogs || [],
        metrics: json.metrics || emptyData.metrics,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل إدارة العلاقات الحكومية.");
    } finally {
      setLoading(false);
    }
  }

  async function previewFile(fileId: string) {
    setWorking(`preview-${fileId}`);
    setError("");
    try {
      const res = await fetch("/api/government-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview-file", fileId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر إنشاء رابط المعاينة.");
      window.open(json.result.signedUrl, "_blank", "noopener,noreferrer");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء رابط المعاينة.");
    } finally {
      setWorking("");
    }
  }

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/government-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ العملية.");
      setMessage(messageForAction(action));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ العملية.");
    } finally {
      setWorking("");
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError("ارفع الوثيقة أولًا.");
      return;
    }
    if (selectedFile.size > 4_000_000) {
      setError("حجم الملف كبير على هذه الواجهة. ارفع صورة أو PDF أصغر من 4MB حاليًا.");
      return;
    }

    setWorking("upload-document");
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const payload = await readFilePayload(selectedFile);
      const res = await fetch("/api/government-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload-document",
          data: {
            documentType: String(form.get("documentType") || ""),
            title: String(form.get("title") || ""),
            issuer: String(form.get("issuer") || ""),
            notes: String(form.get("notes") || ""),
            fileName: selectedFile.name,
            mimeType: selectedFile.type || "application/octet-stream",
            ...payload,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر رفع الوثيقة.");
      setMessage("تم رفع الوثيقة واستخراج بياناتها وإنشاء مهمة متابعة.");
      setSelectedFile(null);
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر رفع الوثيقة.");
    } finally {
      setWorking("");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/">
            <ArrowRight size={16} /> العودة للشركة
          </Link>
          <span className="eyebrow">
            <Landmark size={16} /> إدارة العلاقات الحكومية
          </span>
          <h1>مركز الوثائق الحكومية والتجديد</h1>
          <p>
            احفظ السجلات والشهادات والرخص، استخرج بياناتها، راقب تواريخ الانتهاء، واجعل التجديد يبدأ من مصدر رسمي ورسوم واضحة قبل الاعتماد.
          </p>
          <div className="department-hero-actions">
            <span>
              <FileBadge2 size={16} /> الوثائق {data.metrics.totalDocuments}
            </span>
            <span>
              <CalendarClock size={16} /> قريب الانتهاء {data.metrics.expiringSoon}
            </span>
            <span>
              <ShieldCheck size={16} /> بوابات جاهزة {data.metrics.readyPortals}
            </span>
          </div>
        </div>
        <div className="department-badge">
          <strong>Government OS</strong>
          <small>{data.metrics.expired ? "يحتاج متابعة" : "جاهز للتشغيل"}</small>
        </div>
      </section>

      <section className="ops-metrics">
        <Metric title="كل الوثائق" value={data.metrics.totalDocuments} tone="green" />
        <Metric title="وثائق نشطة" value={data.metrics.activeDocuments} tone="green" />
        <Metric title="تجديد قريب" value={data.metrics.expiringSoon} tone="amber" />
        <Metric title="منتهية" value={data.metrics.expired} tone="red" />
        <Metric title="بيانات ناقصة" value={data.metrics.missingData} tone="amber" />
        <Metric title="مصادر رسوم" value={data.metrics.lastCheckedSources} tone="green" />
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" type="button" onClick={load} disabled={loading || Boolean(working)}>
          {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          تحديث
        </button>
        <button className="secondary-btn" type="button" onClick={() => runAction("seed")} disabled={Boolean(working)}>
          {working === "seed" ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
          تهيئة الإدارة
        </button>
        <button className="primary-btn" type="button" onClick={() => runAction("refresh-fees")} disabled={Boolean(working)}>
          {working === "refresh-fees" ? <Loader2 className="spin" size={16} /> : <FileSearch size={16} />}
          تحديث الرسوم من الجهات الرسمية
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={uploadDocument}>
          <div>
            <span className="eyebrow">
              <Upload size={16} /> رفع وثيقة حكومية
            </span>
            <h2>ارفع الوثيقة والنظام يستخرج بياناتها</h2>
            <p className="muted">الصور تقرأ بالذكاء الاصطناعي عند توفر مفتاح OpenAI. ملفات PDF تحفظ وتدخل مسار مراجعة إذا تعذر استخراج النص.</p>
          </div>
          <div className="ops-form-grid">
            <label>
              نوع الوثيقة
              <select className="input" name="documentType" defaultValue="COMMERCIAL_REGISTRATION">
                {documentTypes.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الجهة المصدرة
              <input className="input" name="issuer" placeholder="وزارة التجارة، الزكاة والضريبة..." />
            </label>
          </div>
          <label>
            اسم الوثيقة
            <input className="input" name="title" placeholder="مثلاً: السجل التجاري الرئيسي" />
          </label>
          <label>
            الملف
            <input className="input" type="file" accept="image/*,.pdf,.txt,.csv,.json" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
          </label>
          <label>
            ملاحظة أو نص من الوثيقة
            <textarea className="textarea compact" name="notes" placeholder="اكتب أي رقم أو تاريخ ظاهر إذا كانت الوثيقة PDF غير قابلة للقراءة." />
          </label>
          <button className="primary-btn" disabled={working === "upload-document"}>
            {working === "upload-document" ? <Loader2 className="spin" size={18} /> : <Upload size={18} />}
            رفع وتحليل الوثيقة
          </button>
        </form>

        <section className="ops-card executive-brief">
          <span className="eyebrow">
            <ShieldCheck size={16} /> سياسة التجديد
          </span>
          <h2>كيف سيعمل التجديد الإلكتروني؟</h2>
          <p>
            النظام يحضر الطلب ويجمع البيانات والرسوم والرابط الرسمي. التجديد الآلي الكامل يحتاج ربط بوابة الجهة أو تفويض دخول رسمي مثل نفاذ، وبعدها يصبح التنفيذ قابلًا للأتمتة.
          </p>
          <div className="statement-list">
            {data.integrations.map((item) => (
              <div className="statement-row action" key={item.id}>
                <span>
                  <b>{item.provider}</b>
                  <small>{item.status}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="ops-board two">
        <Board title="الوثائق الحكومية" count={data.documents.length}>
          {data.documents.length === 0 && <Empty text="لا توجد وثائق بعد. ارفع أول وثيقة لتظهر هنا." />}
          {data.documents.slice(0, 8).map((document) => (
            <DocumentRow
              document={document}
              key={document.id}
              working={working}
              onPlan={() => runAction("renewal-plan", { documentId: document.id })}
              onPrepare={() => runAction("prepare-renewal", { documentId: document.id })}
            />
          ))}
        </Board>

        <Board title="مهام التجديد" count={nextTasks.length}>
          {nextTasks.length === 0 && <Empty text="لا توجد مهام تجديد مفتوحة." />}
          {nextTasks.map((task) => (
            <article className="department-row" key={task.id}>
              <div>
                <span className={`mini-pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
                <strong>{task.title}</strong>
                <p>{task.status} - موعد المتابعة {formatDate(task.due_date)}</p>
                <small>{formatMoney(task.fee_amount)} · {task.renewal_url ? "يوجد رابط تجديد" : "يحتاج رابط"}</small>
              </div>
            </article>
          ))}
        </Board>
      </section>

      <section className="ops-board two">
        <Board title="ملفات الوثائق والنسخ" count={data.files.length}>
          {data.files.length === 0 && <Empty text="لا توجد ملفات مخزنة بعد." />}
          {data.files.slice(0, 10).map((file) => (
            <article className="department-row" key={file.id}>
              <div>
                <span className={`mini-pill ${file.is_current ? "done" : ""}`}>v{file.version_no || 1}</span>
                <strong>{file.file_name}</strong>
                <p>{file.file_category || file.mime_type || "ملف وثيقة"} · {Math.round(Number(file.file_size || 0) / 1024)} KB</p>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => previewFile(file.id)} disabled={Boolean(working)} title="معاينة الملف">
                  {working === `preview-${file.id}` ? <Loader2 className="spin" size={15} /> : <FileSearch size={15} />}
                </button>
              </div>
            </article>
          ))}
        </Board>

        <Board title="سجل الوصول للوثائق" count={data.accessLogs.length}>
          {data.accessLogs.length === 0 && <Empty text="لا يوجد سجل وصول بعد." />}
          {data.accessLogs.slice(0, 10).map((log) => (
            <article className="department-row" key={log.id}>
              <div>
                <span className="mini-pill">{log.action}</span>
                <strong>{log.actor_role}</strong>
                <p>{formatDate(log.created_at)}</p>
              </div>
            </article>
          ))}
        </Board>
      </section>

      <section className="ops-board two">
        <Board title="مصادر الرسوم الرسمية" count={data.fees.length}>
          {data.fees.map((fee) => (
            <article className="department-row" key={fee.id}>
              <div>
                <span className="mini-pill">{fee.last_checked_status || fee.source_confidence || "OFFICIAL"}</span>
                <strong>{fee.service_name}</strong>
                <p>{fee.fee_text}</p>
                <small>
                  {formatMoney(fee.fee_amount)} · آخر تحقق {formatDate(fee.last_checked_at)}
                </small>
              </div>
              <a className="secondary-btn" href={fee.official_url} target="_blank" rel="noreferrer" title="فتح الجهة الرسمية">
                <ExternalLink size={15} />
              </a>
            </article>
          ))}
        </Board>

        <Board title="الإنذارات والبيانات الناقصة" count={data.documents.filter((doc) => doc.status !== "ACTIVE" || doc.missing_fields?.length).length}>
          {data.documents.filter((doc) => doc.status !== "ACTIVE" || doc.missing_fields?.length).length === 0 && <Empty text="لا توجد إنذارات حاليًا." />}
          {data.documents
            .filter((doc) => doc.status !== "ACTIVE" || doc.missing_fields?.length)
            .slice(0, 8)
            .map((doc) => (
              <article className="department-row alert-row" key={doc.id}>
                <div>
                  <span className="mini-pill high">{doc.status}</span>
                  <strong>{doc.title}</strong>
                  <p>الحقول الناقصة: {doc.missing_fields?.join("، ") || "لا يوجد"}.</p>
                  <small>الثقة: {Math.round(Number(doc.extraction_confidence || 0) * 100)}%</small>
                </div>
                <AlertTriangle size={18} />
              </article>
            ))}
        </Board>
      </section>
    </main>
  );
}

function messageForAction(action: string) {
  if (action === "seed") return "تم تهيئة إدارة العلاقات الحكومية.";
  if (action === "refresh-fees") return "تم تحديث مصادر الرسوم الرسمية.";
  if (action === "renewal-plan") return "تم إنشاء خطة التجديد.";
  if (action === "prepare-renewal") return "تم تحضير مسار التجديد الإلكتروني.";
  return "تم تنفيذ العملية.";
}

async function readFilePayload(file: File) {
  const isText = file.type.startsWith("text/") || /\.(txt|csv|json)$/i.test(file.name);
  if (isText) {
    return { fileText: await readAsText(file) };
  }
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

function Metric({ title, value, tone }: { title: string; value: number; tone: "green" | "red" | "amber" }) {
  return (
    <article className={`metric-card ${tone === "red" ? "red" : "green"}`}>
      <small>{title}</small>
      <strong>{value.toLocaleString("ar-SA")}</strong>
    </article>
  );
}

function Board({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="department-board-column">
      <header>
        <h2>{title}</h2>
        <span>{count}</span>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="department-empty">{text}</p>;
}

function DocumentRow({
  document,
  working,
  onPlan,
  onPrepare,
}: {
  document: GovernmentDocument;
  working: string;
  onPlan: () => void;
  onPrepare: () => void;
}) {
  return (
    <article className="department-row">
      <div>
        <span className={`mini-pill ${document.status.toLowerCase()}`}>{statusArabic(document.status)}</span>
        <strong>{document.title}</strong>
        <p>
          {document.issuer || "جهة غير محددة"} · رقم الوثيقة {document.document_number || document.tax_number || "غير مستخرج"}
        </p>
        <small>
          ينتهي: {formatDate(document.expiry_date)} · التجديد: {formatDate(document.renewal_date)} · {formatMoney(document.fee_amount)}
        </small>
      </div>
      <div className="row-actions">
        <button type="button" onClick={onPlan} disabled={Boolean(working)} title="إنشاء خطة تجديد">
          {working === "renewal-plan" ? <Loader2 className="spin" size={15} /> : <FileSearch size={15} />}
        </button>
        <button type="button" onClick={onPrepare} disabled={Boolean(working)} title="تحضير التجديد الإلكتروني">
          {working === "prepare-renewal" ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={15} />}
        </button>
        {document.renewal_url && (
          <a href={document.renewal_url} target="_blank" rel="noreferrer" title="فتح بوابة التجديد">
            <ExternalLink size={15} />
          </a>
        )}
      </div>
    </article>
  );
}

function statusArabic(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "نشطة",
    RENEWAL_SOON: "قريب التجديد",
    RENEWAL_URGENT: "عاجل",
    EXPIRED: "منتهية",
    NEEDS_REVIEW: "تحتاج مراجعة",
  };
  return labels[status] || status;
}

function formatDate(value?: string | null) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "غير محدد";
  return date.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "الرسوم حسب البوابة";
  return currency.format(Number(value || 0));
}
