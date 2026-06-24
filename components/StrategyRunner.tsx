"use client";

import { FormEvent, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, ClipboardCheck, Loader2, Send, Sparkles, UserRoundCheck } from "lucide-react";

type EmployeeResult = {
  name: string;
  role: string;
  output: string;
};

type PipelineResult = {
  ok: true;
  runId: string;
  finalResult: string;
  employees: EmployeeResult[];
  saved: boolean;
};

const aiEmployees = [
  { name: "موظف تحليل السوق", role: "يفهم الطلب والسوق والقيود" },
  { name: "موظف الفرص", role: "يحدد أفضل مسارات التنفيذ" },
  { name: "موظف القرار", role: "يختار القرار الأنسب" },
  { name: "موظف التنفيذ", role: "يحوّل القرار إلى مهام وتسليم" },
];

export default function StrategyRunner() {
  const [result, setResult] = useState<PipelineResult | null>(null);
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
      const res = await fetch("/api/agents/pipeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request,
          market: form.get("market"),
          budget: form.get("budget"),
          timeframe: form.get("timeframe"),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "تعذر تنفيذ الطلب.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ الطلب.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="company-app">
      <section className="request-panel">
        <div className="request-copy">
          <span className="eyebrow"><Sparkles size={16} /> شركة موظفين ذكاء اصطناعي</span>
          <h1>اكتب طلبك مرة واحدة، والموظفون ينفذونه ويرجعون لك التسليم كاملًا</h1>
          <p>
            هذا هو الإجراء الأساسي: تدخل طلبًا واضحًا، يعمل فريق AI خلف الكواليس، ثم تستلم نتيجة نهائية منظمة قابلة للتنفيذ.
          </p>
        </div>

        <form className="request-form" onSubmit={submit}>
          <label>
            الطلب المطلوب تنفيذه
            <textarea
              name="request"
              className="textarea command-box"
              required
              defaultValue="احصر الوضع الحالي للشركة من ناحية كل شيء، ثم قدم خطة عمل تنفيذية جاهزة تشمل المهام والأدوار والجدول الزمني والمخاطر."
            />
          </label>

          <div className="compact-grid">
            <label>
              مجال الشركة
              <input className="input" name="market" defaultValue="شركة تجارة وخدمات في السعودية" />
            </label>
            <label>
              الميزانية التقريبية
              <input className="input" name="budget" type="number" min="0" defaultValue="50000" />
            </label>
            <label>
              مدة التنفيذ
              <select className="input" name="timeframe" defaultValue="90 يومًا">
                <option>30 يومًا</option>
                <option>90 يومًا</option>
                <option>6 أشهر</option>
              </select>
            </label>
          </div>

          <button className="primary-btn big-action" disabled={loading}>
            {loading ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
            {loading ? "الموظفون ينفذون الطلب الآن" : "تنفيذ الطلب"}
          </button>
          {error && <p className="notice error">{error}</p>}
        </form>
      </section>

      <section className="employee-strip" aria-label="AI employees">
        {aiEmployees.map((employee, index) => (
          <article className={`employee-card ${loading ? "active" : result ? "done" : ""}`} key={employee.name}>
            <span>{result ? <CheckCircle2 size={18} /> : index + 1}</span>
            <strong>{employee.name}</strong>
            <small>{employee.role}</small>
          </article>
        ))}
      </section>

      <section className="delivery-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow"><ClipboardCheck size={16} /> التسليم النهائي</span>
            <h2>نتيجة الطلب</h2>
          </div>
          <span className={`status-pill ${loading ? "running" : result ? "done" : ""}`}>
            {loading ? "قيد التنفيذ" : result ? "تم التسليم" : "بانتظار الطلب"}
          </span>
        </div>

        {!result && !loading && (
          <div className="empty-state">
            <BriefcaseBusiness size={34} />
            <strong>لا توجد نتيجة بعد</strong>
            <span>اكتب الطلب واضغط تنفيذ. لن تظهر لك سجلات داخلية أو خطوات مشتتة، فقط التسليم الكامل.</span>
          </div>
        )}

        {loading && (
          <div className="empty-state">
            <Loader2 className="spin" size={34} />
            <strong>جاري تنفيذ الطلب</strong>
            <span>يتم توزيع الطلب على الموظفين، تلخيص القرار، وتجهيز خطة التسليم.</span>
          </div>
        )}

        {result && (
          <>
            <pre className="final-result">{result.finalResult}</pre>
            <div className="employee-results">
              {result.employees.map((employee) => (
                <details key={employee.name}>
                  <summary><UserRoundCheck size={17} /> {employee.name} - {employee.role}</summary>
                  <pre>{employee.output}</pre>
                </details>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
