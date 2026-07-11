"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";

type AnalysisAction = {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  portalUrl?: string;
};

type AnalysisRisk = {
  level: string;
  title: string;
  detail?: string;
};

type Analysis = {
  summary?: string;
  documentType?: string;
  documentNumber?: string;
  issuer?: string;
  ownerName?: string;
  taxNumber?: string;
  startDate?: string;
  expiryDate?: string;
  renewalDate?: string;
  city?: string;
  activity?: string;
  confidence?: number;
  missingFields?: string[];
  recommendedActions?: AnalysisAction[];
  risks?: AnalysisRisk[];
};

type StoredFile = {
  id: string;
  file_name: string;
  mime_type?: string;
  file_size?: number;
  storage_path?: string;
  created_at?: string;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  due_date?: string;
  description?: string;
};

type Doc = {
  id: string;
  title: string;
  document_type?: string;
  issuer?: string | null;
  document_number?: string | null;
  owner_name?: string | null;
  tax_number?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
  renewal_date?: string | null;
  city?: string | null;
  activity?: string | null;
  status: string;
  analysis_status?: string;
  analysis_engine?: string | null;
  analysis_error?: string | null;
  automation_status?: string;
  missing_fields?: string[];
  extraction_confidence?: number;
  extracted_data?: Analysis;
  current_file?: StoredFile | null;
  latest_extraction?: {
    extraction_engine?: string;
    model_name?: string;
    error_message?: string;
    confidence?: number;
    status?: string;
  } | null;
  tasks?: Task[];
  renewal_tasks?: Task[];
};

type Metrics = {
  totalDocuments: number;
  analyzedDocuments: number;
  needsReview: number;
  storedFiles: number;
  openTasks: number;
  ownerCheckpoints: number;
};

type DashboardResponse = {
  ok: boolean;
  documents?: Doc[];
  companyTasks?: Task[];
  tasks?: Task[];
  operator?: { id: string; name: string; title: string };
  metrics?: Metrics;
  error?: string;
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

const fieldLabels: Record<string, string> = {
  documentNumber: "رقم الوثيقة",
  issuer: "الجهة المصدرة",
  ownerName: "اسم المنشأة أو المالك",
  taxNumber: "الرقم الضريبي",
  startDate: "تاريخ الإصدار",
  expiryDate: "تاريخ الانتهاء",
  city: "المدينة",
  activity: "النشاط",
};

const emptyMetrics: Metrics = {
  totalDocuments: 0,
  analyzedDocuments: 0,
  needsReview: 0,
  storedFiles: 0,
  openTasks: 0,
  ownerCheckpoints: 0,
};

function humanBytes(value?: number) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    ACTIVE: "سارية",
    NEEDS_REVIEW: "تحتاج مراجعة",
    EXPIRED: "منتهية",
    RENEWAL_URGENT: "تجديد عاجل",
    RENEWAL_SOON: "تجديد قريب",
    COMPLETED: "مكتمل",
    PARTIAL: "مكتمل جزئيًا",
    PENDING: "قيد المعالجة",
    EXTRACTED: "تم الاستخراج",
    TODO: "جديدة",
    IN_PROGRESS: "قيد التنفيذ",
    REVIEW: "مراجعة",
    DONE: "مكتملة",
    WAITING_OWNER: "بانتظار المالك",
    SCHEDULED: "مجدولة",
    OPEN: "مفتوحة",
  };
  return labels[String(value || "")] || String(value || "غير محدد");
}

async function postJson(body: Record<string, unknown>) {
  const res = await fetch("/api/government-relations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ الإجراء.");
  return json;
}

export default function GovernmentRelationsConsole() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [companyTasks, setCompanyTasks] = useState<Task[]>([]);
  const [renewalTasks, setRenewalTasks] = useState<Task[]>([]);
  const [operator, setOperator] = useState({ name: "ماجد", title: "مسؤول العلاقات الحكومية" });
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [actionId, setActionId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(silent = false) {
    if (!silent) setWorking(true);
    setError("");
    try {
      const res = await fetch("/api/government-relations", { cache: "no-store" });
      const json = (await res.json()) as DashboardResponse;
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل مركز العلاقات الحكومية.");
      setDocs(json.documents || []);
      setCompanyTasks(json.companyTasks || []);
      setRenewalTasks(json.tasks || []);
      setOperator(json.operator || operator);
      setMetrics(json.metrics || emptyMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل مركز العلاقات الحكومية.");
    } finally {
      if (!silent) setWorking(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!file) {
      setError("اختر ملفاً أولاً.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("حجم الملف أكبر من 8 ميجابايت.");
      return;
    }

    setWorking(true);
    setError("");
    setMessage("جاري حفظ الملف الأصلي وتحليله وإنشاء مهام المتابعة...");
    const form = new FormData(formElement);
    form.set("action", "upload-document");
    form.set("file", file);

    try {
      const res = await fetch("/api/government-relations", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر رفع الوثيقة.");
      const result = json.result || {};
      const analysis: Analysis = result.analysis || {};
      const confidence = Math.round(Number(analysis.confidence || 0) * 100);
      const missing = analysis.missingFields?.length || 0;
      const automationFailed = (result.automation?.operations || []).filter((item: { ok: boolean }) => !item.ok).length;
      setMessage(
        `تم حفظ الملف في قاعدة البيانات، وتحليله بنسبة ثقة ${confidence}%، وإنشاء مهمة لماجد ونقطة اعتماد للمالك` +
          `${missing ? `، مع ${missing} حقل يحتاج مراجعة` : ""}` +
          `${automationFailed ? `، وتعذر إنشاء ${automationFailed} إجراء مساعد وسيظهر للمراجعة` : ""}.`
      );
      setFile(null);
      formElement.reset();
      await load(true);
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "تعذر رفع الوثيقة.");
    } finally {
      setWorking(false);
    }
  }

  async function reanalyze(documentId: string) {
    setActionId(documentId);
    setError("");
    setMessage("جاري إعادة تحليل الملف الأصلي المحفوظ...");
    try {
      const json = await postJson({ action: "reanalyze-document", documentId });
      const confidence = Math.round(Number(json.result?.analysis?.confidence || 0) * 100);
      setMessage(`اكتملت إعادة التحليل بنسبة ثقة ${confidence}%، وتم تحديث مهام ماجد والمتابعة.`);
      await load(true);
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "تعذر إعادة التحليل.");
    } finally {
      setActionId("");
    }
  }

  async function preview(fileId: string) {
    const popup = window.open("about:blank", "_blank");
    setActionId(fileId);
    setError("");
    try {
      const json = await postJson({ action: "preview-file", fileId });
      if (popup && json.result?.signedUrl) popup.location.href = json.result.signedUrl;
      else if (json.result?.signedUrl) window.location.href = json.result.signedUrl;
    } catch (err) {
      popup?.close();
      setError(err instanceof Error ? err.message : "تعذر فتح الملف.");
    } finally {
      setActionId("");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTasks = useMemo(() => {
    const seen = new Set<string>();
    return [...companyTasks, ...renewalTasks].filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  }, [companyTasks, renewalTasks]);

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <span className="eyebrow"><ShieldCheck size={15} /> Government Operations Center</span>
          <h1>العلاقات الحكومية</h1>
          <p>مركز تشغيلي يحفظ الوثائق، يحللها، يستخرج بياناتها، ينشئ المتابعات، ويراقب التجديدات والتغييرات الرسمية.</p>
        </div>
        <div className="mini-pill" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <UserRound size={15} /> {operator.name} · {operator.title}
        </div>
      </section>

      <section className="bento-grid">
        <Metric icon={<FileText size={18} />} label="الوثائق" value={metrics.totalDocuments} />
        <Metric icon={<Brain size={18} />} label="تم تحليلها" value={metrics.analyzedDocuments} />
        <Metric icon={<Database size={18} />} label="ملفات محفوظة" value={metrics.storedFiles} />
        <Metric icon={<AlertTriangle size={18} />} label="تحتاج مراجعة" value={metrics.needsReview} />
        <Metric icon={<ListChecks size={18} />} label="مهام مفتوحة" value={metrics.openTasks} />
        <Metric icon={<Clock3 size={18} />} label="بانتظار المالك" value={metrics.ownerCheckpoints} />
      </section>

      <section className="bento-card bento-full" style={{ gap: 10 }}>
        <span className="bento-kicker"><ShieldCheck size={15} /> حدود التنفيذ الآمن</span>
        <strong>ماجد يراجع الوثيقة ويفتح الرابط الرسمي ويجهز الحقول، ثم يتوقف قبل الخطوات الحساسة.</strong>
        <p className="muted" style={{ margin: 0 }}>
          المالك وحده يدخل عبر نفاذ، ويكتب كلمة المرور أو رمز التحقق، ويعتمد الدفع أو الإرسال النهائي. لا تكتب هذه البيانات في الملاحظات ولا يحفظها النظام.
        </p>
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" type="button" onClick={() => load()} disabled={working}>
          {working ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />} تحديث المركز
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submit}>
          <span className="eyebrow"><Upload size={16} /> إدخال وثيقة حكومية</span>
          <h2>حفظ وتحليل وتشغيل المتابعة</h2>
          <p className="muted">
            يدعم النظام ملفات PDF الممسوحة والصور والملفات النصية. يحفظ الملف الأصلي أولاً، ثم يسجل نتيجة التحليل وينشئ المتابعة المناسبة.
          </p>
          <label>
            نوع الوثيقة
            <select className="input" name="documentType" defaultValue="COMMERCIAL_REGISTRATION">
              {documentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>الجهة المصدرة<input className="input" name="issuer" placeholder="وزارة التجارة أو الجهة الرسمية" /></label>
          <label>اسم الوثيقة<input className="input" name="title" placeholder="يستخرجه النظام تلقائياً عند تركه فارغاً" /></label>
          <label>
            الملف
            <input
              className="input"
              type="file"
              name="file"
              accept="image/*,.pdf,.txt,.csv,.json"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          {file && <p className="muted" style={{ margin: 0 }}>{file.name} · {humanBytes(file.size)}</p>}
          <label>
            ملاحظة تشغيلية
            <textarea className="textarea compact" name="notes" placeholder="اكتب سياق المعاملة فقط، ولا تضع كلمة مرور أو رمز تحقق أو بيانات نفاذ" />
          </label>
          <button className="primary-btn" disabled={working}>
            {working ? <Loader2 className="spin" size={18} /> : <Upload size={18} />} حفظ وتحليل وإنشاء المتابعة
          </button>
        </form>

        <section className="ops-card">
          <span className="eyebrow"><UserRound size={16} /> نموذج العمل</span>
          <h2>كيف يتعامل ماجد مع الوثيقة؟</h2>
          <ol style={{ display: "grid", gap: 12, paddingInlineStart: 22, lineHeight: 1.8 }}>
            <li>يحفظ الملف الأصلي في مساحة خاصة مرتبطة بالشركة.</li>
            <li>يستخرج الأرقام والتواريخ والجهة والنشاط والالتزامات الظاهرة.</li>
            <li>يسجل درجة الثقة والحقول الناقصة والمخاطر.</li>
            <li>ينشئ مهمة داخل الشركة وخطة متابعة أو تجديد.</li>
            <li>يجهز جلسة عمل بالرابط الرسمي والحقول القابلة للنسخ.</li>
            <li>يتوقف عند نقطة اعتماد المالك قبل أي خطوة حساسة أو نهائية.</li>
          </ol>
        </section>
      </section>

      <section className="ops-board two">
        <Board title="الوثائق الحكومية" count={docs.length}>
          {docs.length === 0 && <p className="department-empty">لا توجد وثائق بعد.</p>}
          {docs.map((doc) => {
            const analysis = doc.extracted_data || {};
            const confidence = Math.round(Number(doc.extraction_confidence || analysis.confidence || 0) * 100);
            return (
              <article className="department-row" key={doc.id} style={{ alignItems: "stretch" }}>
                <div style={{ width: "100%", display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 7 }}>
                        <span className="mini-pill">{statusLabel(doc.status)}</span>
                        <span className="mini-pill">تحليل: {statusLabel(doc.analysis_status)}</span>
                        <span className="mini-pill">تشغيل: {statusLabel(doc.automation_status)}</span>
                      </div>
                      <strong>{doc.title}</strong>
                      <p>{doc.issuer || "جهة غير مستخرجة"} · {doc.document_number || doc.tax_number || "الرقم يحتاج مراجعة"}</p>
                    </div>
                    <strong style={{ whiteSpace: "nowrap" }}>{confidence}% ثقة</strong>
                  </div>

                  <p className="muted" style={{ margin: 0 }}>{analysis.summary || "لم يسجل ملخص التحليل بعد."}</p>

                  <div className="quick-nav" style={{ margin: 0 }}>
                    <Field label="رقم الوثيقة" value={doc.document_number} />
                    <Field label="اسم المنشأة" value={doc.owner_name} />
                    <Field label="الرقم الضريبي" value={doc.tax_number} />
                    <Field label="تاريخ الإصدار" value={doc.start_date} />
                    <Field label="تاريخ الانتهاء" value={doc.expiry_date} />
                    <Field label="موعد التجديد" value={doc.renewal_date} />
                  </div>

                  {!!doc.missing_fields?.length && (
                    <div className="notice error">
                      <AlertTriangle size={15} /> الحقول التي تحتاج مراجعة: {doc.missing_fields.map((item) => fieldLabels[item] || item).join("، ")}
                    </div>
                  )}

                  {doc.analysis_error && (
                    <div className="notice error">تعذر التحليل الذكي وتم استخدام مسار المراجعة الآمن: {doc.analysis_error}</div>
                  )}

                  {!!analysis.risks?.length && (
                    <div style={{ display: "grid", gap: 7 }}>
                      <b>المخاطر</b>
                      {analysis.risks.map((risk, index) => (
                        <p className="muted" style={{ margin: 0 }} key={`${risk.title}-${index}`}>• {risk.level}: {risk.title}{risk.detail ? ` — ${risk.detail}` : ""}</p>
                      ))}
                    </div>
                  )}

                  {!!analysis.recommendedActions?.length && (
                    <div style={{ display: "grid", gap: 7 }}>
                      <b>الإجراءات المقترحة</b>
                      {analysis.recommendedActions.map((action, index) => (
                        <p className="muted" style={{ margin: 0 }} key={`${action.title}-${index}`}>• {action.title}{action.dueDate ? ` · ${action.dueDate}` : ""}</p>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {doc.current_file && (
                      <button className="secondary-btn btn-sm" type="button" onClick={() => preview(doc.current_file!.id)} disabled={actionId === doc.current_file.id}>
                        {actionId === doc.current_file.id ? <Loader2 className="spin" size={14} /> : <ExternalLink size={14} />} فتح الملف المحفوظ
                      </button>
                    )}
                    <button className="secondary-btn btn-sm" type="button" onClick={() => reanalyze(doc.id)} disabled={actionId === doc.id}>
                      {actionId === doc.id ? <Loader2 className="spin" size={14} /> : <RotateCcw size={14} />} إعادة التحليل
                    </button>
                  </div>

                  {doc.current_file && (
                    <small><FileCheck2 size={13} style={{ verticalAlign: "middle" }} /> محفوظ: {doc.current_file.file_name} · {humanBytes(doc.current_file.file_size)}</small>
                  )}
                </div>
              </article>
            );
          })}
        </Board>

        <Board title="مهام ماجد والمتابعة" count={allTasks.length}>
          {allTasks.length === 0 && <p className="department-empty">لا توجد مهام حكومية مفتوحة.</p>}
          {allTasks.map((task) => (
            <article className="department-row" key={task.id}>
              <div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 7 }}>
                  <span className="mini-pill">{statusLabel(task.status)}</span>
                  {task.priority && <span className="mini-pill">{task.priority}</span>}
                </div>
                <strong>{task.title}</strong>
                {task.description && <p>{task.description}</p>}
                <small>{task.due_date ? `الموعد: ${String(task.due_date).slice(0, 10)}` : "الموعد يحدد بعد المراجعة"}</small>
              </div>
            </article>
          ))}
        </Board>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <section className="bento-card">
      <span className="bento-kicker">{icon} {label}</span>
      <span className="bento-value">{value}</span>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="quick-nav-card" style={{ cursor: "default", alignItems: "flex-start" }}>
      <span><CheckCircle2 size={15} /></span>
      <div><small>{label}</small><strong style={{ display: "block" }}>{value || "غير مستخرج"}</strong></div>
    </div>
  );
}

function Board({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="department-board-column"><header><h2>{title}</h2><span>{count}</span></header><div>{children}</div></section>;
}
