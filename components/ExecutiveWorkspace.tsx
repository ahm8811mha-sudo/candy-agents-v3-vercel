"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpLeft, RefreshCw, Plus, ArrowLeft, CircleAlert } from "lucide-react";

type Workspace = {
  asOf: string;
  counts: { decisions: number; projects: number; blocked: number; proof: number };
  stages: { study: number; decision: number; approved: number; execution: number };
  approvals: Array<{ id: string; title: string; amount: number | null; requested_role: string; type: string }>;
  projects: Array<{ id: string; name: string; project_number: number | null; budget: number | null }>;
  blockers: Array<{ id: string; title: string; status: string; project_id: string | null }>;
};
const number = new Intl.NumberFormat("ar-SA");
const money = (value: number | null) => value == null ? "لم يحدد مبلغ" : `${number.format(value)} ر.س`;
export default function ExecutiveWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/workspace", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل مساحة العمل.");
      setData(json); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر الاتصال."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const first = data?.approvals[0];
  return <main className="workspace workspace-home">
    <header className="workspace-heading">
      <div><p className="eyebrow">مكتب القيادة / مساحة العمل</p><h1>الشركة، بوضوح.</h1><p className="workspace-intro">ما يحتاج قرارك. ما يوقف التنفيذ. وما يأتي بعده.</p></div>
      <Link className="primary-btn" href="/ideas?new=1"><Plus size={17} /> فتح ملف فكرة</Link>
    </header>
    <div className="workspace-dateline"><span>النجمة الذهبية <span aria-hidden> / </span> سجل العمل</span><button className="text-action" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} />{loading ? "جارٍ القراءة" : "تحديث البيانات"}</button></div>
    {error ? <div className="workspace-notice is-error" role="alert"><CircleAlert size={20} /><div><strong>لا يمكن تأكيد الحالة الحالية</strong><p>{error}</p>{data ? <small>المعروض أدناه آخر قراءة ناجحة؛ قد لا يكون محدثاً.</small> : null}</div></div> : null}
    {!data && loading ? <p className="workspace-empty" role="status">جارٍ قراءة سجلات الشركة…</p> : null}
    {data ? <>
      <section className="workspace-metrics" aria-label="حالة العمل">
        {[[data.counts.decisions, "قرار ينتظر المراجعة", "/inbox"], [data.counts.blocked, "خطوة متوقفة", "/projects"], [data.counts.projects, "مشروع نشط", "/projects"], [data.counts.proof, "مهمة فعلية قيد المراجعة", "/projects"]].map(([value, label, href]) => <Link href={String(href)} key={String(label)}><span>{String(label)}</span><strong>{number.format(Number(value))}</strong><ArrowUpLeft size={18} /></Link>)}
      </section>
      <div className="workspace-columns">
        <div className="workspace-primary">
          <section className="priority-dossier" aria-labelledby="priority-title">
            <div className="section-caption"><span>01 / على مكتبك</span><span>الأقدم أولاً</span></div>
            <h2 id="priority-title">{first ? first.title : "مساحة للخطوة التالية."}</h2>
            <p>{first ? "هذا الطلب لم يصدر قراره بعد. راجع سياقه وتكلفته قبل الاعتماد." : "لا توجد اعتمادات معلّقة في السجل. يمكنك مراجعة التنفيذ أو استكمال دراسة فكرة."}</p>
            {first ? <div className="dossier-amount"><span>المبلغ المطلوب</span><strong>{money(first.amount)}</strong><small>اعتماد الطلب لا يعني صرف المبلغ</small></div> : null}
            <Link href={first ? `/inbox?decision=${encodeURIComponent(first.id)}` : "/ideas"} className="primary-btn">{first ? "فتح ملف القرار" : "مراجعة الأفكار"}<ArrowLeft size={16} /></Link>
          </section>
          <section className="workspace-section"><div className="section-title"><h2>عوائق تحتاج متابعة</h2><Link href="/projects">كل المشاريع <ArrowUpLeft size={15} /></Link></div>
            {data.blockers.length ? <div className="work-register">{data.blockers.map((task, index) => <Link href={task.project_id ? `/projects?project=${task.project_id}` : "/operations"} className="work-register-row" key={task.id}><span className="register-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{task.title}</strong><small>{task.status === "WAITING_FUNDING" ? "بانتظار اعتماد التمويل" : task.status === "ON_HOLD" ? "معلّقة وتحتاج مراجعة" : "متعطلة — افتح الخطوة لمعرفة سياقها"}</small></div><ArrowUpLeft size={18} /></Link>)}</div> : <p className="workspace-empty">لا تظهر خطوات معلّقة أو متوقفة في السجل.</p>}
            {data.counts.blocked > data.blockers.length ? <small className="workspace-footnote">تُعرض أقدم {data.blockers.length} خطوات من {data.counts.blocked}.</small> : null}
          </section>
        </div>
        <aside className="workspace-secondary">
          <section className="workspace-section journey-section"><div className="section-caption">02 / من الفكرة إلى العمل</div><h2>أين وصلنا؟</h2><ol className="work-journey">
            {[["study", "استكمال الدراسة", "/ideas?status=UNDER_STUDY"], ["decision", "جاهزة للقرار", "/ideas?status=PENDING_APPROVAL"], ["approved", "معتمدة للتحويل", "/ideas?status=APPROVED"], ["execution", "مرتبطة بمشروع", "/projects"]].map(([key, label, href], i) => <li key={key}><span className="journey-node">{i + 1}</span><Link href={href}>{label}<strong>{number.format(data.stages[key as keyof Workspace["stages"]])}</strong></Link></li>)}
          </ol><p className="workspace-footnote">الاعتماد يتطلب دراسة مكتملة. الإنجاز الفعلي يحتاج إثباتاً.</p></section>
          <section className="workspace-section"><div className="section-title"><h2>مشاريع نشطة</h2><Link href="/projects" aria-label="عرض كل المشاريع"><ArrowUpLeft size={19} /></Link></div>{data.projects.length ? data.projects.map((project) => <Link className="project-brief" href={`/projects?project=${project.id}`} key={project.id}><small>ملف / {project.project_number || "—"}</small><strong>{project.name}</strong><span>{money(project.budget)} <ArrowUpLeft size={15} /></span></Link>) : <p className="workspace-empty">لا مشاريع نشطة مسجلة.</p>}</section>
        </aside>
      </div>
      <footer className="workspace-footer">قراءة من سجلات الشركة <span>آخر تحديث: {new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.asOf))}</span></footer>
    </> : null}
  </main>;
}
