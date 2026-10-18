"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, RefreshCw, ArrowUpLeft, ArrowLeft, Search, X, FileText, Check, Loader2 } from "lucide-react";
import type { Idea, IdeaStatus } from "@/lib/company/ideas";
import type { IdeaStudyInput } from "@/lib/company/ideaAssessment";

const statusLabels: Record<IdeaStatus, string> = { UNDER_STUDY: "قيد الدراسة", PENDING_APPROVAL: "بانتظار القرار", APPROVED: "معتمدة", REJECTED: "مرفوضة" };
const filters: Array<{ value: IdeaStatus | "ALL"; label: string }> = [{ value: "ALL", label: "كل الملفات" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value: value as IdeaStatus, label }))];
const number = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const money = (n: number) => number.format(n) + " ر.س";
const numericFields = [["expectedUnits", "الكمية المتوقعة"], ["unitPriceSAR", "سعر بيع الوحدة · ر.س"], ["unitCostSAR", "تكلفة الوحدة · ر.س"], ["fixedCostSAR", "التكاليف الثابتة · ر.س"]] as const;
const textFields = [["demandEvidence", "دليل الطلب أو الحاجة", "ما الدليل المتوفر؟ صف الاختبار أو بيانات المبيعات أو الحاجة التشغيلية.", 3000], ["evidenceSource", "مرجع الدليل", "رابط، رقم تقرير، أو وصف مصدر البيانات وتاريخه.", 1000], ["executionOwner", "مسؤول التنفيذ", "اسم المسؤول أو دوره", 160], ["successMetric", "مؤشر النجاح", "نتيجة قابلة للقياس ضمن مدة التجربة", 500], ["risks", "المخاطر وحدود التجربة", "متى نوقف التجربة؟ وما الخسارة المقبولة؟", 2000]] as const;

function StudyEditor({ idea, busy, onSave }: { idea: Idea; busy: boolean; onSave: (study: IdeaStudyInput, budget: number) => Promise<boolean> }) {
  const input = idea.aggregate?.assessment?.input || {};
  const [kind, setKind] = useState(input.kind || "COMMERCIAL");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const study: IdeaStudyInput = { kind, expectedOutcome: String(form.get("expectedOutcome") || "") };
    for (const [key] of numericFields) { const value = String(form.get(key) || "").trim(); if (value) study[key] = Number(value); }
    for (const [key] of textFields) study[key] = String(form.get(key) || "").trim();
    await onSave(study, Number(form.get("budget")));
  }
  return <form className="study-form" onSubmit={submit}>
    <div className="section-caption">افتراضات الدراسة / يمكن حفظها جزئياً</div>
    <p className="workspace-footnote">أدخل ما تعرفه واترك المجهول فارغاً. الصفر يعني تكلفة أو كمية صفرية، وليس معلومة مفقودة.</p>
    <label className="field-label">سقف ميزانية التجربة · ر.س<input className="input" name="budget" type="number" min="0" max="1000000000" step="any" required defaultValue={idea.budgetSAR} /></label>
    <label className="field-label">نوع الدراسة<select className="input" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="COMMERCIAL">فرصة تجارية — اختبار مبيعات وتكاليف</option><option value="OPERATIONAL">تحسين تشغيلي — اختبار أثر على العمل</option></select></label>
    {kind === "OPERATIONAL" ? <label className="field-label">الأثر التشغيلي المتوقع<textarea className="input" name="expectedOutcome" maxLength={1000} rows={3} defaultValue={input.expectedOutcome || ""} placeholder="مثال: تقليص مدة تجهيز الطلب من يومين إلى يوم، عبر اختبار على 10 طلبات." /></label> : null}
    {kind === "COMMERCIAL" ? <fieldset><legend>01 / النموذج المالي</legend><div className="study-grid">{numericFields.map(([key, label]) => <label className="field-label" key={key}>{label}<input className="input" name={key} type="number" inputMode="decimal" min="0" max="1000000000" step="any" defaultValue={input[key] ?? ""} placeholder="غير محدد" /></label>)}</div></fieldset> : null}
    <fieldset><legend>{kind === "COMMERCIAL" ? "02" : "01"} / الأدلة والمسؤولية</legend>{textFields.map(([key, label, placeholder, maxLength]) => <label className="field-label" key={key}>{label}{key === "demandEvidence" || key === "risks" ? <textarea className="input" name={key} rows={3} maxLength={maxLength} defaultValue={input[key] || ""} placeholder={placeholder} /> : <input className="input" name={key} maxLength={maxLength} defaultValue={input[key] || ""} placeholder={placeholder} />}</label>)}</fieldset>
    <div className="study-save"><button className="primary-btn" disabled={busy} type="submit">{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />} حفظ الدراسة وإعادة التقييم</button><small>تُرسل للاعتماد عند اكتمال المدخلات والميزانية. لا يتم صرف أي مبلغ.</small></div>
  </form>;
}

export default function IdeasBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<IdeaStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const detail = useRef<HTMLElement>(null);
  const creation = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/company/ideas", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر تحميل الأفكار.");
      setIdeas(json.ideas || []); setError(""); setLoaded(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر الاتصال."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const params = new URLSearchParams(window.location.search); setCreating(params.get("new") === "1"); setSelectedId(params.get("idea") || ""); const status = params.get("status"); if (status && status in statusLabels) setFilter(status as IdeaStatus); }, [load]);
  useEffect(() => { if (creating) creation.current?.querySelector("input")?.focus(); }, [creating]);
  const shown = ideas.filter((i) => (filter === "ALL" || i.status === filter) && (i.title + " " + i.hypothesis).includes(query.trim()));
  const selected = shown.find((i) => i.id === selectedId) || shown[0];
  const assessment = selected?.aggregate?.assessment;
  const projections = assessment?.projections;
  async function mutate(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/company/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "لم يؤكد النظام حفظ التغيير.");
      if (json.idea) { setSelectedId(json.idea.id); setFilter("ALL"); setQuery(""); }
      setNotice(json.reason || success);
      await load();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إتمام العملية."); return false; }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await mutate({ action: "submit", title: form.get("title"), hypothesis: form.get("hypothesis"), budgetSAR: Number(form.get("budget")), horizonDays: Number(form.get("horizon")) }, "حُفظ ملف الفكرة. استكمل الدراسة قبل طلب الاعتماد.");
    if (ok) { setCreating(false); setEditing(true); }
  }
  function openIdea(idea: Idea) {
    setSelectedId(idea.id); setEditing(false);
    if (window.matchMedia("(max-width: 900px)").matches) window.requestAnimationFrame(() => detail.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  const terminal = selected && ["APPROVED", "REJECTED"].includes(selected.status);
  return <main className="workspace ideas-workspace">
    <header className="workspace-heading"><div><p className="eyebrow">مكتب التطوير / سجل الفرص</p><h1>الفكرة تبدأ بسؤال.</h1><p className="workspace-intro">والقرار يبدأ بدليل. افتح ملفاً، اختبر الفرضية، ثم اعتمد الخطوة التالية.</p></div><button className="primary-btn" onClick={() => setCreating(!creating)} aria-expanded={creating}>{creating ? <X size={17} /> : <Plus size={17} />}{creating ? "إغلاق النموذج" : "فكرة جديدة"}</button></header>
    <div className="workspace-dateline"><span>{loaded ? number.format(ideas.length) + " ملفات مسجلة" : "سجل الأفكار"}</span><div className="inline-actions"><button className="text-action" disabled={busy || loading} onClick={() => void mutate({ action: "generate" }, "تمت مراجعة السجلات.")}>رصد فرصة من بيانات الشركة <ArrowUpLeft size={15} /></button><button className="icon-action" disabled={loading || busy} aria-label="تحديث الأفكار" onClick={() => void load()}><RefreshCw size={16} className={loading ? "spin" : ""} /></button></div></div>
    {error ? <div className="workspace-notice is-error" role="alert">{error}</div> : null}
    {notice ? <div className="workspace-notice" role="status">{notice}</div> : null}
    {creating ? <form ref={creation} className="idea-intake" onSubmit={create}><div><p className="section-caption">ملف جديد</p><h2>ما الفرصة التي تريد اختبارها؟</h2><p>لا تحتاج دراسة مكتملة الآن. احفظ الفرضية ثم أضف أدلتها.</p></div><div className="intake-fields"><label className="field-label">عنوان الفكرة<input className="input" name="title" required minLength={3} maxLength={160} placeholder="عنوان محدد للفرصة" /></label><label className="field-label">الفرضية التي سنختبرها<textarea className="input" name="hypothesis" required minLength={10} maxLength={5000} rows={3} placeholder="إذا نفذنا… نتوقع… وسنتحقق عبر…" /></label><div className="study-grid"><label className="field-label">ميزانية التجربة · ر.س<input className="input" name="budget" type="number" min="0" max="1000000000" step="any" required defaultValue="0" /></label><label className="field-label">المدة · يوم<input className="input" name="horizon" type="number" min="1" max="3650" required defaultValue="30" /></label></div><button className="primary-btn" type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <FileText size={16} />} حفظ وفتح الدراسة</button></div></form> : null}
    <div className="ideas-toolbar"><div className="register-filters" aria-label="تصفية حالة الأفكار">{filters.map((item) => <button className={filter === item.value ? "active" : ""} aria-pressed={filter === item.value} key={item.value} onClick={() => { setFilter(item.value); setEditing(false); }}>{item.label}<span>{ideas.filter((i) => item.value === "ALL" || i.status === item.value).length}</span></button>)}</div><label className="register-search"><Search size={17} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في الملفات" aria-label="ابحث في الأفكار" /></label></div>
    {loading && !loaded ? <p className="workspace-empty" role="status">جارٍ قراءة سجل الأفكار…</p> : null}
    {!loading && loaded && shown.length === 0 ? <section className="workspace-empty"><FileText size={28} /><h2>{ideas.length ? "لا ملفات تطابق البحث" : "مساحة للأفكار التي تستحق الدراسة."}</h2><p>{ideas.length ? "غيّر البحث أو تصفية الحالة." : "أضف فكرة من واقع عملك، أو ارصد فرصة من بيانات المخزون والمهام."}</p>{ideas.length ? <button className="secondary-btn" onClick={() => { setQuery(""); setFilter("ALL"); }}>إظهار كل الملفات</button> : <button className="primary-btn" onClick={() => setCreating(true)}>فتح أول ملف</button>}</section> : null}
    {selected ? <div className="idea-desk"><nav className="idea-register" aria-label="ملفات الأفكار">{shown.map((idea, index) => <button key={idea.id} aria-current={selected.id === idea.id ? "true" : undefined} className={selected.id === idea.id ? "idea-file active" : "idea-file"} onClick={() => openIdea(idea)}><span className="idea-file-top"><small>ملف {String(index + 1).padStart(2, "0")}</small><span className={"work-status status-" + idea.status.toLowerCase()}>{idea.executedProjectId ? "في التنفيذ" : statusLabels[idea.status]}</span></span><strong>{idea.title}</strong><span className="idea-file-bottom"><span>{money(idea.budgetSAR)}</span><span>{idea.aggregate?.assessment ? "اكتمال " + idea.aggregate.assessment.coverage + "٪" : "تحتاج إعادة دراسة"}</span></span></button>)}</nav>
    <article ref={detail} className="idea-dossier" aria-label="تفاصيل الفكرة">
      <div className="section-caption"><span>{selected.source === "TEAM" ? "من السجلات التشغيلية" : "مقدمة من المالك"}</span><span>{selected.horizonDays} يوم للتجربة</span></div>
      <h2>{selected.title}</h2><p className="idea-hypothesis">{selected.hypothesis}</p>
      <div className="idea-facts"><div><small>سقف الميزانية</small><strong>{money(selected.budgetSAR)}</strong></div><div><small>اكتمال المدخلات</small><strong>{assessment ? assessment.coverage + "٪" : "غير مقاس"}</strong></div><div><small>صاحب الصلاحية</small><strong>{selected.tierLabel}</strong></div></div>
      <p className="workspace-footnote">اكتمال المدخلات ليس احتمالاً للنجاح، والمصادر المدخلة لم يتحقق منها النظام مستقلاً.</p>
      {!assessment ? <div className="workspace-notice">هذه دراسة سابقة. أضف البيانات والمصادر لإعادة تقييمها قبل الاعتماد.</div> : assessment.missing.length ? <div className="study-gaps"><strong>قبل القرار، نحتاج:</strong><ul>{assessment.missing.map((item) => <li key={item}>{item}</li>)}</ul></div> : <div className="workspace-notice"><Check size={18} /><span>{selected.aggregate?.summary}</span></div>}
      <div className="dossier-actions">{!terminal ? <button className="primary-btn" onClick={() => setEditing(!editing)} aria-expanded={editing}>{editing ? "إغلاق محرر الدراسة" : assessment?.readyForDecision ? "مراجعة المدخلات" : "استكمال الدراسة"}<ArrowLeft size={16} /></button> : null}
        {selected.status === "PENDING_APPROVAL" && assessment?.readyForDecision ? <Link className="secondary-btn" href={"/inbox?decision=" + encodeURIComponent(selected.approvalId || "")}>فتح طلب الاعتماد <ArrowUpLeft size={16} /></Link> : null}
        {selected.status === "APPROVED" ? selected.executedProjectId ? <Link className="primary-btn" href={"/projects?project=" + selected.executedProjectId}>فتح المشروع <ArrowUpLeft size={16} /></Link> : <button className="primary-btn" disabled={busy} onClick={() => void mutate({ action: "execute", ideaId: selected.id }, "تم حفظ المشروع واستكمال طلبات تمويله.")}>تحويل إلى مشروع / استكمال المحاولة</button> : null}
      </div>
      {editing && !terminal ? <StudyEditor key={selected.id + ":" + (selected.revision || 0)} idea={selected} busy={busy} onSave={async (study, budgetSAR) => { const ok = await mutate({ action: "study", ideaId: selected.id, revision: selected.revision || 0, study, budgetSAR }, "حُفظت الدراسة وأعيد تقييمها."); if (ok) setEditing(false); return ok; }} /> : null}
      {!editing ? <>
        <section className="study-results"><div className="section-title"><h3>{assessment?.input.kind === "OPERATIONAL" ? "الأثر الذي سنختبره" : "قراءة مالية للفرضية"}</h3><span className="workspace-footnote">توقعات، وليست نتائج فعلية</span></div>{assessment?.input.kind === "OPERATIONAL" ? <p className="idea-hypothesis">{assessment.input.expectedOutcome || "حدّد الأثر التشغيلي المتوقع ومؤشر قياسه في الدراسة."}</p> : projections ? <><dl className="projection-register">{[[ "إيراد متوقع", money(projections.revenueSAR)], ["تكلفة متوقعة", money(projections.totalCostSAR)], ["نتيجة التجربة", money(projections.profitSAR)], ["كمية التعادل", projections.breakEvenUnits === null ? "لا تعادل بهامش غير موجب" : number.format(projections.breakEvenUnits)], ["النتيجة مع انخفاض الكمية 30٪", money(projections.downsideProfitSAR)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="workspace-footnote">الحساب: الكمية × (السعر − تكلفة الوحدة) − التكاليف الثابتة. لا يشمل عناصر لم تُدخل في الدراسة.</p></> : <p className="workspace-empty">لن تُعرض أرباح تقديرية قبل إدخال النموذج المالي والميزانية.</p>}</section>
        <section className="study-reviews"><div className="section-title"><h3>مراجعة الأقسام</h3>{!terminal ? <button className="text-action" disabled={busy} onClick={() => void mutate({ action: "analyze", ideaId: selected.id }, "اكتملت محاولة التحليل؛ تحقق من مصدر المراجعة.")}>طلب تحليل إضافي</button> : null}</div>{selected.aggregate?.analysisWarning ? <p className="workspace-notice">{selected.aggregate.analysisWarning}</p> : null}{selected.recommendations.map((review) => <details key={review.agentId}><summary><span>{review.agentTitle}</span><small>{review.origin === "MODEL" ? "تحليل نموذج" : review.origin === "OWNER_NOTE" ? "ملاحظة مضافة" : "قراءة للمدخلات"}</small><span>{review.verdict === "APPROVE" ? "مؤيد" : review.verdict === "REJECT" ? "غير مؤيد" : "مشروط"}</span></summary><p>{review.report}</p></details>)}</section>
      </> : null}
    </article></div> : null}
  </main>;
}
