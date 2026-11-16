"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpLeft, RefreshCw, Plus, ArrowLeft, CircleAlert } from "lucide-react";
import DecisionDeskPanel from "./DecisionDeskPanel";
import ChairmanCommandComposer from "./ChairmanCommandComposer";
import CounterDrilldown from "./CounterDrilldown";
import type { CounterItem } from "@/lib/company/counterItems";

type Workspace = {
  asOf: string;
  counts: { decisions: number; returned?: number; projects: number; blocked: number; proof: number };
  stages: { study: number; decision: number; approved: number; execution: number };
  approvals: Array<{ id: string; title: string; amount: number | null; requested_role: string; type: string; duplicateCount?: number }>;
  projects: Array<{ id: string; name: string; project_number: number | null; budget: number | null }>;
  blockers: Array<{ id: string; title: string; status: string; project_id: string | null }>;
  items?: Partial<Record<"decisions" | "returned" | "blocked" | "projects" | "proof" | "study" | "decision" | "approved" | "execution", CounterItem[]>>;
};
const number = new Intl.NumberFormat("ar-SA-u-nu-latn");
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
  return <main className="workspace workspace-home ov-home">
    <header className="workspace-heading">
      <div><h1>الشركة، بوضوح.</h1><p className="workspace-intro">ما يحتاج قرارك. ما يوقف التنفيذ. وما يأتي بعده.</p></div>
      <Link className="primary-btn" href="/ideas?new=1"><Plus size={17} /> فتح ملف فكرة</Link>
    </header>
    <ChairmanCommandComposer />
    <DecisionDeskPanel />
    <div className="workspace-dateline"><span>أورفانتا <span aria-hidden> / </span> سجل العمل</span><button className="text-action" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} />{loading ? "جارٍ القراءة" : "تحديث البيانات"}</button></div>
    {error ? <div className="workspace-notice is-error" role="alert"><CircleAlert size={20} /><div><strong>لا يمكن تأكيد الحالة الحالية</strong><p>{error}</p>{data ? <small>المعروض أدناه آخر قراءة ناجحة؛ قد لا يكون محدثاً.</small> : null}</div></div> : null}
    {!data && loading ? <p className="workspace-empty" role="status">جارٍ قراءة سجلات الشركة…</p> : null}
    {data ? <>
      <CounterDrilldown label="حالة العمل" counters={[
        { key: "decisions", label: "قرار ينتظر المراجعة", items: data.items?.decisions || [], total: data.counts.decisions, hint: "طلبات أكملت سلسلة المراجعة بلا إيقاف وتنتظر قرارك.", empty: "لا قرار ينتظرك الآن." },
        { key: "returned", label: "معاد للأقسام", items: data.items?.returned || [], total: data.counts.returned ?? 0, hint: "أوقفتها المالية أو الحوكمة أو سلطان وأُعيدت لصاحبها للتصحيح. لا تنتظر قرارك.", empty: "لا شيء معاد للأقسام." },
        { key: "blocked", label: "خطوة متوقفة", items: data.items?.blocked || [], total: data.counts.blocked, empty: "لا خطوات متوقفة." },
        { key: "projects", label: "مشروع نشط", items: data.items?.projects || [], total: data.counts.projects, empty: "لا مشاريع نشطة." },
        { key: "proof", label: "مهمة فعلية قيد المراجعة", items: data.items?.proof || [], total: data.counts.proof, empty: "لا مهام فعلية تنتظر المراجعة." },
      ]} />
      <div className="workspace-columns">
        <div className="workspace-primary">
          <section className="priority-dossier" aria-labelledby="priority-title">
            <div className="section-caption"><span>01 / على مكتبك</span><span>الأقدم أولاً</span></div>
            <h2 id="priority-title">{first ? first.title : "مساحة للخطوة التالية."}{first?.duplicateCount && first.duplicateCount > 1 ? ` (مكرر ×${first.duplicateCount})` : ""}</h2>
            <p>{first ? "هذا الطلب لم يصدر قراره بعد. راجع سياقه وتكلفته قبل الاعتماد." : "لا توجد اعتمادات معلّقة في السجل. يمكنك مراجعة التنفيذ أو استكمال دراسة فكرة."}</p>
            {first ? <div className="dossier-amount"><span>المبلغ المطلوب</span><strong>{money(first.amount)}</strong><small>اعتماد الطلب لا يعني صرف المبلغ</small></div> : null}
            <Link href={first ? `/inbox?decision=${encodeURIComponent(first.id)}` : "/ideas"} className="primary-btn">{first ? "فتح ملف القرار" : "مراجعة الأفكار"}<ArrowLeft size={16} /></Link>
          </section>
          <section className="workspace-section"><div className="section-title"><h2>عوائق تحتاج متابعة</h2><Link href="/projects">كل المشاريع <ArrowUpLeft size={15} /></Link></div>
            {data.blockers.length ? <div className="work-register">{data.blockers.map((task, index) => <Link href={task.project_id ? `/projects?project=${task.project_id}` : "/operations"} className="work-register-row" key={task.id}><span className="register-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{task.title}</strong><small>{task.status === "WAITING_FUNDING" ? "بانتظار اعتماد التمويل" : task.status === "ON_HOLD" ? "معلّقة وتحتاج مراجعة" : "متعطلة، افتح الخطوة لمعرفة سياقها"}</small></div><ArrowUpLeft size={18} /></Link>)}</div> : <p className="workspace-empty">لا تظهر خطوات معلّقة أو متوقفة في السجل.</p>}
            {data.counts.blocked > data.blockers.length ? <small className="workspace-footnote">تُعرض أقدم {data.blockers.length} خطوات من {data.counts.blocked}.</small> : null}
          </section>
        </div>
        <aside className="workspace-secondary">
          <section className="workspace-section journey-section"><div className="section-caption">02 / من الفكرة إلى العمل</div><h2>أين وصلنا؟</h2>
          <CounterDrilldown compact label="مراحل الأفكار" counters={[
            { key: "study", label: "استكمال الدراسة", items: data.items?.study || [], total: data.stages.study, empty: "لا أفكار قيد الدراسة." },
            { key: "decision", label: "جاهزة للقرار", items: data.items?.decision || [], total: data.stages.decision, empty: "لا أفكار جاهزة للقرار." },
            { key: "approved", label: "معتمدة للتحويل", items: data.items?.approved || [], total: data.stages.approved, empty: "لا أفكار معتمدة تنتظر التحويل." },
            { key: "execution", label: "مرتبطة بمشروع", items: data.items?.execution || [], total: data.stages.execution, empty: "لا أفكار مرتبطة بمشروع." },
          ]} />
          <p className="workspace-footnote">الاعتماد يتطلب دراسة مكتملة. الإنجاز الفعلي يحتاج إثباتاً.</p></section>
          <section className="workspace-section"><div className="section-title"><h2>مشاريع نشطة</h2><Link href="/projects" aria-label="عرض كل المشاريع"><ArrowUpLeft size={19} /></Link></div>{data.projects.length ? data.projects.map((project) => <Link className="project-brief" href={`/projects?project=${project.id}`} key={project.id}><small>ملف / {project.project_number || "—"}</small><strong>{project.name}</strong><span>{money(project.budget)} <ArrowUpLeft size={15} /></span></Link>) : <p className="workspace-empty">لا مشاريع نشطة مسجلة.</p>}</section>
        </aside>
      </div>
      <footer className="workspace-footer">قراءة من سجلات الشركة <span>آخر تحديث: {new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.asOf))}</span></footer>
    </> : null}
  </main>;
}
