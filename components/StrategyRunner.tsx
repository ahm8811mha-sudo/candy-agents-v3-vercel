"use client";

import { FormEvent, useState } from "react";
import { BarChart3, Boxes, Building2, Calculator, CheckCircle2, ClipboardList, Loader2, Megaphone, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";

type CompanyResult = {
  ok: true;
  request: string;
  accounting: string;
  marketing: string;
  operations: string;
  supplyChain: string;
  decision: string;
  saved: boolean;
};

const departments = [
  { key: "accounting", title: "الإدارة المالية", role: "الميزانية، التكاليف، العائد، المخاطر", icon: Calculator },
  { key: "marketing", title: "إدارة التسويق", role: "السوق، الجمهور، الاستراتيجية، مؤشرات الأداء", icon: Megaphone },
  { key: "operations", title: "إدارة العمليات", role: "خطة التنفيذ، الموارد، الجدول، الخطوات", icon: ClipboardList },
  { key: "supplyChain", title: "سلسلة الإمداد", role: "المخزون، الموردون، اللوجستيات، التحسين", icon: Boxes },
  { key: "decision", title: "الرئيس التنفيذي", role: "تلخيص التقارير وإصدار القرار النهائي", icon: ShieldCheck },
] as const;

export default function StrategyRunner() {
  const [result, setResult] = useState<CompanyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    const form = new FormData(event.currentTarget);
    const request = String(form.get("request") || "").trim();

    try {
      const res = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر تشغيل الشركة.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل الشركة.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="company-app">
      <section className="request-panel">
        <div className="request-copy">
          <span className="eyebrow"><Building2 size={16} /> شركة ذكاء اصطناعي متكاملة</span>
          <h1>اكتب طلبك، وكل إدارة في الشركة تنفذه وتعيد تقريرها</h1>
          <p>
            النظام يعمل مثل شركة حقيقية: المالية تضع الميزانية، التسويق يدرس السوق، العمليات تجهز التنفيذ، سلسلة الإمداد تضبط الموردين، والرئيس التنفيذي يصدر القرار.
          </p>
        </div>

        <form className="request-form" onSubmit={submit}>
          <label>
            الطلب المطلوب تنفيذه
            <textarea
              name="request"
              className="textarea command-box"
              required
              defaultValue="أبغى ميزانية وخطة لإطلاق متجر إلكتروني بميزانية 100,000 ريال، مع تحليل مالي وتسويقي وتشغيلي ومخاطر وسلسلة إمداد وقرار نهائي."
            />
          </label>

          <button className="primary-btn big-action" disabled={loading}>
            {loading ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
            {loading ? "أقسام الشركة تعمل على الطلب" : "تشغيل الشركة"}
          </button>

          {error && <p className="notice error">{error}</p>}
        </form>
      </section>

      <section className="employee-strip" aria-label="أقسام الشركة">
        {departments.map((department, index) => {
          const Icon = department.icon;
          const complete = Boolean(result?.[department.key]);
          const href = department.key === "accounting"
            ? "/departments/finance"
            : department.key === "marketing"
              ? "/departments/marketing"
              : department.key === "operations"
                ? "/departments/operations"
                : department.key === "supplyChain"
                  ? "/departments/supply-chain"
                  : "/departments/executive";

          return (
            <Link className={`employee-card department-link ${loading ? "active" : complete ? "done" : ""}`} href={href} key={department.key}>
              <span>{complete ? <CheckCircle2 size={18} /> : <Icon size={18} />}</span>
              <strong>{department.title}</strong>
              <small>{department.role}</small>
              <em>{loading ? "قيد العمل" : complete ? "اكتمل التقرير" : `مرحلة ${index + 1}`}</em>
            </Link>
          );
        })}
      </section>

      <section className="delivery-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow"><BarChart3 size={16} /> التقارير والقرار</span>
            <h2>نتيجة الشركة</h2>
          </div>
          <span className={`status-pill ${loading ? "running" : result ? "done" : ""}`}>
            {loading ? "قيد التنفيذ" : result ? "تم التسليم" : "بانتظار الطلب"}
          </span>
        </div>

        {!result && !loading && (
          <div className="empty-state">
            <Building2 size={34} />
            <strong>لا توجد تقارير بعد</strong>
            <span>اكتب الطلب واضغط تشغيل الشركة. سيظهر تقرير كل إدارة والقرار النهائي هنا.</span>
          </div>
        )}

        {loading && (
          <div className="empty-state">
            <Loader2 className="spin" size={34} />
            <strong>الشركة تعمل الآن</strong>
            <span>يتم توزيع الطلب على الإدارات ثم جمع التقارير في قرار تنفيذي واحد.</span>
          </div>
        )}

        {result && (
          <div className="report-stack">
            <Report title="قرار الرئيس التنفيذي" content={result.decision} featured />
            <Report title="التقرير المالي" content={result.accounting} />
            <Report title="تقرير التسويق" content={result.marketing} />
            <Report title="تقرير العمليات" content={result.operations} />
            <Report title="تقرير سلسلة الإمداد" content={result.supplyChain} />
          </div>
        )}
      </section>
    </main>
  );
}

function Report({ title, content, featured = false }: { title: string; content: string; featured?: boolean }) {
  return (
    <article className={`report-card ${featured ? "featured" : ""}`}>
      <h3>{title}</h3>
      <pre>{content}</pre>
    </article>
  );
}
