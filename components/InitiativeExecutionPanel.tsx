"use client";

import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, Clock3, FileCheck2, PlayCircle, TableProperties } from "lucide-react";
import type { InitiativePlan } from "@/lib/company/initiativePlanning";
import type { AgentDeliverable } from "@/lib/company/internalAgentExecutor";

type InitiativeProject = { id: string; name: string; status?: string; approval_status?: string; created_at?: string };
type InitiativeAction = { id: string; project_id?: string | null; title: string; status: string; error?: string | null; payload?: Record<string, unknown> | null; result?: Record<string, unknown> | null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function phaseCopy(status: string) {
  if (status === "PENDING_APPROVAL") return { label: "الخطة تنتظر اعتمادًا واحدًا", tone: "waiting" };
  if (status === "RESULTS_READY") return { label: "اكتملت أعمال الوكلاء والنتائج جاهزة", tone: "ready" };
  if (status === "EXECUTION_ATTENTION") return { label: "التنفيذ يحتاج معالجة تعثّر", tone: "attention" };
  if (status === "REJECTED") return { label: "الخطة مرفوضة ولم يبدأ التنفيذ", tone: "attention" };
  return { label: "الوكلاء ينفذون الخطة المعتمدة", tone: "running" };
}

function TableBlock({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <div className="initiative-table-block">
      <h3><TableProperties size={17} /> {title}</h3>
      <div className="initiative-table-scroll" tabIndex={0} aria-label={title}>
        <table className="initiative-table">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.join("|")}>{row.map((cell, index) => <td key={`${columns[index] || index}:${cell}`}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function InitiativeExecutionPanel({ plan, project, actions }: { plan: InitiativePlan; project: InitiativeProject; actions: InitiativeAction[] }) {
  const phase = phaseCopy(project.status || "PENDING_APPROVAL");
  const projectActions = actions.filter((action) => action.project_id === project.id);
  const completed = projectActions.filter((action) => action.status === "DONE").length;
  const failed = projectActions.filter((action) => action.status === "FAILED").length;
  const timeline = plan.specialistPlans.flatMap((specialist) => specialist.steps.map((step) => ({ ...step, roleLabel: specialist.roleLabel }))).sort((a, b) => a.dueDay - b.dueDay);

  return (
    <section className="ops-card initiative-execution" id="initiative-delivery" aria-labelledby="initiative-title">
      <header className="initiative-execution__header">
        <div>
          <span className="eyebrow"><PlayCircle size={16} /> مسار القرار ثم التنفيذ والنتائج</span>
          <h2 id="initiative-title">{plan.kind === "AMAZON_COMMERCE" ? "خطة تجربة Amazon للمصانع" : plan.title}</h2>
          <p>{plan.finalRecommendation}</p>
        </div>
        <div className={`initiative-phase ${phase.tone}`} role="status"><span /><strong>{phase.label}</strong><small>{completed}/{plan.specialistPlans.length} حزم مكتملة{failed ? ` · ${failed} متعثرة` : ""}</small></div>
      </header>

      <dl className="initiative-facts">
        <div><dt>قرار المكتب</dt><dd>بدء مشروط</dd></div><div><dt>مدة التجربة</dt><dd>{plan.durationDays} يومًا</dd></div><div><dt>سقف التجربة</dt><dd>{plan.plannedBudget.toLocaleString("ar-SA")} ريال</dd></div><div><dt>فرق العمل</dt><dd>{plan.specialistPlans.length} وكلاء</dd></div><div><dt>مصدر التخطيط</dt><dd>{plan.planningMode === "AI_ASSISTED" ? "وكلاء AI" : plan.planningMode === "HYBRID" ? "هجين" : "خطة معيارية"}</dd></div>
      </dl>

      {project.status === "PENDING_APPROVAL" && <div className="initiative-approval-callout"><div><strong>المطلوب منك قرار واحد فقط</strong><p>بعد الاعتماد يبدأ وكلاء التسويق والمالية والتشغيل والمشتريات والمخاطر تلقائيًا وتعود المخرجات هنا.</p></div><Link className="primary-btn" href="/inbox"><CheckCircle2 size={18} /> فتح الاعتماد</Link></div>}

      <div className="initiative-section-heading"><div><span>01</span><h3>مقارنة خيارات التنفيذ</h3></div><p>ترتيب الخيارات حسب سرعة التحقق ورأس المال المعرض ومخاطر المخزون.</p></div>
      <TableBlock title="البدائل المقارنة" columns={["الخيار", "النموذج", "الإيراد", "تكلفة البدء", "إشارة أولى", "مخاطر المخزون", "النتيجة"]} rows={plan.options.map((o) => [o.title, o.model, o.revenueModel, o.setupCost, `${o.timeToSignalDays} يومًا`, o.inventoryRisk, `${o.score}/100 · ${o.verdict}`])} />

      <div className="initiative-section-heading"><div><span>02</span><h3>خطط الوكلاء حسب التخصص</h3></div><p>كل خطة مرتبطة بمسؤول ومخرج وموعد.</p></div>
      <div className="initiative-agents">
        {plan.specialistPlans.map((specialist) => {
          const action = projectActions.find((item) => String(asRecord(item.payload)?.role) === specialist.role);
          const deliverable = asRecord(asRecord(action?.result)?.deliverable) as AgentDeliverable | null;
          return (
            <details className="initiative-agent" key={specialist.role} open={specialist.role === "MARKET"}>
              <summary><span className="initiative-agent__identity"><Bot size={18} /><b>{specialist.roleLabel}</b><small>{specialist.agentName}</small></span><span className={`initiative-agent__status ${action?.status?.toLowerCase() || "planned"}`}>{action?.status === "DONE" ? "عاد بالنتيجة" : action?.status === "FAILED" ? "متعثر" : project.status === "PENDING_APPROVAL" ? "جاهز بعد الاعتماد" : "قيد التنفيذ"}</span></summary>
              <div className="initiative-agent__body">
                <p>{deliverable?.summary || specialist.summary}</p>
                <ol>{specialist.steps.map((step) => <li key={step.key}><div><strong>{step.title}</strong><span>{step.objective}</span></div><small>اليوم {step.startDay}-{step.dueDay} · المخرج: {step.deliverable}</small></li>)}</ol>
                {deliverable && <div className="initiative-returned-work">
                  <div className="initiative-returned-work__head"><strong><FileCheck2 size={17} /> ما أعاده الوكيل</strong><small>{deliverable.source === "AI" ? "تنفيذ AI" : "تنفيذ معياري معلّم"} · {deliverable.provider}</small></div>
                  <div className="initiative-returned-work__grid"><div><b>ما أُنجز</b><ul>{deliverable.completedWork.map((item) => <li key={item}>{item}</li>)}</ul></div><div><b>النتائج</b><ul>{deliverable.findings.map((item) => <li key={item}>{item}</li>)}</ul></div><div><b>القرارات المقترحة</b><ul>{deliverable.decisions.map((item) => <li key={item}>{item}</li>)}</ul></div><div><b>الخطوات التالية</b><ul>{deliverable.nextActions.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
                  {deliverable.table && <TableBlock {...deliverable.table} />}
                  {deliverable.metrics.length > 0 && <TableBlock title="مؤشرات التسليم" columns={["المؤشر", "القيمة", "الحالة"]} rows={deliverable.metrics.map((metric) => [metric.name, metric.value, metric.status])} />}
                  {deliverable.verificationNeeded.length > 0 && <div className="initiative-verification-needed"><AlertTriangle size={16} /><div><b>يلزم التحقق قبل التزام خارجي</b><ul>{deliverable.verificationNeeded.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}
                </div>}
                {action?.error && <p className="initiative-error"><AlertTriangle size={16} /> {action.error}</p>}
              </div>
            </details>
          );
        })}
      </div>

      <div className="initiative-section-heading"><div><span>03</span><h3>خطة العمل الزمنية</h3></div><p>تعمل التخصصات بالتوازي ثم يجمع المكتب النتائج.</p></div>
      <TableBlock title="المهام والتسليمات" columns={["اليوم", "الوكيل", "المهمة", "المخرج", "المؤشر"]} rows={timeline.map((s) => [`${s.startDay}-${s.dueDay}`, s.roleLabel, s.title, s.deliverable, s.kpi])} />

      {plan.productCandidates.length > 0 && <><div className="initiative-section-heading"><div><span>04</span><h3>جدول المنتجات المرشحة</h3></div><p>فرضيات تجربة وليست قرار شراء.</p></div><TableBlock title="قائمة الاختبار الأولية" columns={["الفئة", "العميل", "السعر", "التوريد", "السبب", "الاختبار", "قاعدة الرفض"]} rows={plan.productCandidates.map((p) => [p.category, p.customer, p.priceHypothesis, p.sourcingModel, p.reasonToTest, p.validationTest, p.rejectionRule])} /></>}

      <div className="initiative-section-heading"><div><span>{plan.productCandidates.length ? "05" : "04"}</span><h3>خطة التجربة والقرار التالي</h3></div><p>{plan.experiment.hypothesis}</p></div>
      <div className="initiative-experiment">{plan.experiment.stages.map((stage) => <article key={stage.dayRange}><time><Clock3 size={15} /> اليوم {stage.dayRange}</time><strong>{stage.owner}</strong><p>{stage.work}</p><small>التسليم: {stage.deliverable}</small></article>)}</div>
      <div className="initiative-gates"><div><strong>شروط النجاح</strong><ul>{plan.experiment.successCriteria.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>شروط الإيقاف</strong><ul>{plan.experiment.stopConditions.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
      {plan.limitations.length > 0 && <footer className="initiative-limitations"><AlertTriangle size={17} /><div><strong>حدود يجب ألا تتحول إلى ادعاءات</strong>{plan.limitations.map((item) => <p key={item}>{item}</p>)}</div></footer>}
    </section>
  );
}
