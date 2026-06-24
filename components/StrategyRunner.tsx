"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, BadgeDollarSign, BrainCircuit, CheckCircle2, ClipboardList, LineChart, Loader2, Play, ShieldCheck, Sparkles, Target } from "lucide-react";

type PipelineResult = {
  ok: true;
  runId: string;
  marketResult: string;
  opportunityResult: string;
  decisionResult: string;
  executionResult: string;
  saved: boolean;
};

type AgentStage = {
  key: keyof Pick<PipelineResult, "marketResult" | "opportunityResult" | "decisionResult" | "executionResult">;
  title: string;
  subtitle: string;
  icon: typeof LineChart;
};

const stages: AgentStage[] = [
  { key: "marketResult", title: "Market Analyst Agent", subtitle: "اتجاهات السوق، حجم الطلب، المنافسة، والفرص الأولية", icon: LineChart },
  { key: "opportunityResult", title: "Opportunity Agent", subtitle: "اختيار أفضل 3 فرص مع الربحية والمخاطر", icon: Target },
  { key: "decisionResult", title: "Decision Agent", subtitle: "قرار تنفيذي واحد مناسب للميزانية والهدف", icon: BrainCircuit },
  { key: "executionResult", title: "Execution Agent", subtitle: "مهام، أدوار مستقلة، جدول زمني، ومؤشرات متابعة", icon: ClipboardList },
];

const examples = [
  "منتجات العناية والهدايا في السعودية",
  "خدمات B2B للشركات الصغيرة",
  "تجارة إلكترونية للمنتجات المحلية",
];

export default function StrategyRunner() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState(examples[0]);

  const activeSummary = useMemo(() => {
    if (loading) return "النظام يعمل الآن على تمرير المخرجات بين الوكلاء الأربعة بالترتيب.";
    if (result) return result.saved ? "تم حفظ التشغيل في سجل الوكلاء." : "اكتمل التشغيل، ولم يتم الحفظ لأن Supabase غير مضبوط.";
    return "ابدأ بتحليل سوق وميزانية، وسيبني النظام قرارًا وخطة تنفيذ كاملة.";
  }, [loading, result]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    const f = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/agents/pipeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          market: f.get("market"),
          budget: f.get("budget"),
          goal: f.get("goal"),
          riskLevel: f.get("riskLevel"),
          timeframe: f.get("timeframe"),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "تعذر تشغيل الوكلاء.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل الوكلاء.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="agent-pipeline" className="agent-workspace" aria-label="AI agent system">
      <div className="agent-hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> AI System</span>
          <h1>نظام وكلاء ذكاء اصطناعي يحلل السوق ويتخذ القرار ويحوّله إلى تنفيذ</h1>
          <p>
            سلسلة عملية من أربعة وكلاء: محلل سوق، مكتشف فرص، مستشار قرار، ومدير تنفيذ. كل وكيل يستلم مخرجات الذي قبله حتى تصل إلى خطة قابلة للعمل.
          </p>
          <div className="hero-actions">
            <a className="primary-btn" href="#pipeline-form"><Play size={18} /> تشغيل النظام</a>
            <a className="secondary-btn" href="#execution-output"><ClipboardList size={18} /> عرض النتائج</a>
          </div>
        </div>
        <div className="system-map" aria-label="Agent flow">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <div className="system-node" key={stage.key}>
                <div className="node-icon"><Icon size={22} /></div>
                <div>
                  <strong>{stage.title}</strong>
                  <span>{stage.subtitle}</span>
                </div>
                {index < stages.length - 1 && <ArrowLeft className="node-arrow" size={18} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="agent-grid">
        <form id="pipeline-form" className="operator-panel" onSubmit={submit}>
          <div className="panel-title">
            <div>
              <span className="eyebrow"><ShieldCheck size={15} /> غرفة القرار</span>
              <h2>تشغيل كامل للوكلاء</h2>
            </div>
            <span className={`status-pill ${loading ? "running" : result ? "done" : ""}`}>{loading ? "يعمل" : result ? "مكتمل" : "جاهز"}</span>
          </div>

          <label>
            السوق المستهدف
            <input className="input" name="market" value={market} onChange={(event) => setMarket(event.target.value)} required />
          </label>
          <div className="quick-picks">
            {examples.map((item) => <button type="button" key={item} onClick={() => setMarket(item)}>{item}</button>)}
          </div>
          <div className="form-row">
            <label>
              الميزانية
              <input className="input" name="budget" type="number" min="1000" defaultValue="50000" required />
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
          <label>
            الهدف التجاري
            <textarea className="textarea" name="goal" defaultValue="العثور على فرصة مربحة قابلة للتنفيذ بميزانية محدودة مع خطة تشغيل واضحة." required />
          </label>
          <label>
            مستوى المخاطرة
            <select className="input" name="riskLevel" defaultValue="متوازن">
              <option>محافظ</option>
              <option>متوازن</option>
              <option>هجومي</option>
            </select>
          </label>
          <button className="primary-btn submit-btn" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            {loading ? "جاري تشغيل الوكلاء" : "تشغيل السلسلة الكاملة"}
          </button>
          {error && <p className="notice error">{error}</p>}
          <p className="micro-copy">{activeSummary}</p>
        </form>

        <div className="agent-status">
          <div className="panel-title">
            <div>
              <span className="eyebrow"><BadgeDollarSign size={15} /> مخرجات الإدارة</span>
              <h2>حالة السلسلة</h2>
            </div>
          </div>
          <div className="stage-list">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const hasOutput = Boolean(result?.[stage.key]);
              return (
                <article className={`stage-card ${hasOutput ? "complete" : loading ? "pending" : ""}`} key={stage.key}>
                  <div className="stage-number">{hasOutput ? <CheckCircle2 size={18} /> : index + 1}</div>
                  <Icon size={20} />
                  <div>
                    <strong>{stage.title}</strong>
                    <span>{stage.subtitle}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div id="execution-output" className="results-grid">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const output = result?.[stage.key];
          return (
            <article className="result-panel" key={stage.key}>
              <div className="result-heading">
                <Icon size={20} />
                <div>
                  <strong>{stage.title}</strong>
                  <span>{stage.subtitle}</span>
                </div>
              </div>
              <pre>{output || "ستظهر النتيجة هنا بعد تشغيل النظام."}</pre>
            </article>
          );
        })}
      </div>
    </section>
  );
}
