"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Building2,
  CircleDollarSign,
  Gauge,
  GitBranch,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Workflow,
} from "lucide-react";

type Blueprint = {
  definition: string;
  strategicAudit: { strengths: string[]; weaknesses: string[]; criticalRisks: string[] };
  lifecycle: Array<{
    id: string;
    order: number;
    name: string;
    objective: string;
    responsibleEngines: string[];
    approvalRule: string;
    successMetrics: string[];
  }>;
  organization: {
    executiveBoard: Array<{ role: string; name: string; mission: string; kpis: string[] }>;
    businessEngines: Array<{ id: string; name: string; mission: string; metrics: string[] }>;
    workflowEngines: Array<{ id: string; name: string; outcome: string; materialRisk: string }>;
  };
  governance: Record<string, { level: string; description: string; approvers: string[]; controls: string[] }>;
  architecture: { layers: string[]; dataPlane: string[]; canonicalEvents: string[]; reliability: Record<string, unknown> };
  finance: { reportingCurrency: string; modules: string[]; controlSequence: string[]; invariant: string };
  productExperience: { ownerQuestions: string[]; surfaces: Array<{ name: string; purpose: string }>; navigation: string[] };
  performance: { targets: Array<{ id: string; label: string; target: string; percentile?: string }> };
  moat: { notAMoat: string[]; moats: Record<string, string> };
  roadmap: Array<{ id: number; name: string; horizon: string; objectives: string[]; successMetrics: string[] }>;
};

type ApiResponse = {
  ok: boolean;
  generatedAt?: string;
  lifecycleValidation?: { valid: boolean; stageCount: number };
  blueprint?: Blueprint;
  error?: string;
};

export default function ControlRoomPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/company-os/blueprint", { cache: "no-store" });
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.ok || !json.blueprint) throw new Error(json.error || "تعذر تحميل نواة Orvanta.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل نواة Orvanta.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const blueprint = data?.blueprint;

  if (loading && !blueprint) {
    return (
      <main className="page-wrap" style={{ minHeight: "65vh", display: "grid", placeItems: "center" }}>
        <div className="bento-card" style={{ placeItems: "center", gap: 12, minWidth: 260 }}>
          <Loader2 className="spin" size={28} />
          <strong>جاري تشغيل مركز قيادة Orvanta…</strong>
        </div>
      </main>
    );
  }

  if (!blueprint) {
    return (
      <main className="page-wrap">
        <section className="bento-card bento-full bento-card--red" style={{ gap: 12 }}>
          <AlertTriangle size={28} />
          <h1>تعذر فتح مركز القيادة</h1>
          <p>{error}</p>
          <button className="primary-btn" onClick={load}><RefreshCw size={16} /> إعادة المحاولة</button>
        </section>
      </main>
    );
  }

  const auditTotals = {
    strengths: blueprint.strategicAudit.strengths.length,
    weaknesses: blueprint.strategicAudit.weaknesses.length,
    risks: blueprint.strategicAudit.criticalRisks.length,
  };

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Activity size={16} /> Enterprise Control Room</span>
          <h1 className="glow-title">مركز قيادة الشركة الذاتية</h1>
          <p className="page-sub">{blueprint.definition}</p>
        </div>
        <button className="secondary-btn btn-sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
          تحديث
        </button>
      </header>

      <section className="bento-grid">
        <MetricCard icon={<GitBranch size={18} />} label="مراحل دورة الشركة" value={blueprint.lifecycle.length} note={data?.lifecycleValidation?.valid ? "مكتملة ومترابطة" : "تحتاج مراجعة"} />
        <MetricCard icon={<Building2 size={18} />} label="المحركات المؤسسية" value={blueprint.organization.businessEngines.length} note="قدرات أعمال دائمة" />
        <MetricCard icon={<Workflow size={18} />} label="محركات سير العمل" value={blueprint.organization.workflowEngines.length} note="من الهدف إلى النتيجة" />
        <MetricCard icon={<ShieldCheck size={18} />} label="مستويات الحوكمة" value={Object.keys(blueprint.governance).length} note="LOW إلى CRITICAL" />
      </section>

      <section className="bento-card bento-full" style={{ gap: 14 }}>
        <span className="bento-kicker"><BrainCircuit size={16} /> الأسئلة الخمسة التي يجب أن يجيب عنها النظام للمالك</span>
        <div className="bento-grid" style={{ margin: 0 }}>
          {blueprint.productExperience.ownerQuestions.map((question, index) => (
            <article className="bento-card" key={question} style={{ minHeight: 120 }}>
              <small className="mini-pill">0{index + 1}</small>
              <strong style={{ fontSize: "1rem", lineHeight: 1.8 }}>{question}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 12 }}>
        <span className="bento-kicker"><GitBranch size={16} /> دورة الاستثمار والتنفيذ</span>
        <div className="report-stack">
          {blueprint.lifecycle.map((stage) => (
            <article className="report-card" key={stage.id}>
              <h3 style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <span>{stage.order}. {stage.name}</span>
                <small>{stage.responsibleEngines.join(" + ")}</small>
              </h3>
              <p style={{ color: "var(--text-strong)", lineHeight: 1.8 }}>{stage.objective}</p>
              <pre>{[
                `الاعتماد: ${stage.approvalRule}`,
                `المقاييس: ${stage.successMetrics.join(" | ")}`,
              ].join("\n")}</pre>
            </article>
          ))}
        </div>
      </section>

      <section className="bento-grid">
        <article className="bento-card bento-2x" style={{ gap: 12 }}>
          <span className="bento-kicker"><Building2 size={16} /> مجلس الإدارة التنفيذي</span>
          <div className="bento-list">
            {blueprint.organization.executiveBoard.map((executive) => (
              <div className="bento-list__row" key={executive.role} style={{ alignItems: "flex-start" }}>
                <span>
                  <b style={{ color: "var(--text-strong)" }}>{executive.name}</b>
                  <div className="status-row__desc" style={{ lineHeight: 1.7 }}>{executive.mission}</div>
                </span>
                <span className="mini-pill">{executive.role}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="bento-card" style={{ gap: 10 }}>
          <span className="bento-kicker"><Scale size={16} /> التدقيق الصريح</span>
          <strong className="bento-value">{auditTotals.risks}</strong>
          <span className="bento-label">مخاطر استراتيجية حرجة</span>
          <div className="bento-list">
            <div className="bento-list__row"><span>نقاط القوة</span><b>{auditTotals.strengths}</b></div>
            <div className="bento-list__row"><span>نقاط الضعف</span><b>{auditTotals.weaknesses}</b></div>
          </div>
        </article>

        <article className="bento-card" style={{ gap: 10 }}>
          <span className="bento-kicker"><CircleDollarSign size={16} /> المحرك المالي</span>
          <strong className="bento-value">{blueprint.finance.reportingCurrency}</strong>
          <span className="bento-label">عملة التقارير الأساسية</span>
          <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{blueprint.finance.invariant}</p>
        </article>
      </section>

      <section className="bento-card bento-full" style={{ gap: 12 }}>
        <span className="bento-kicker"><ShieldCheck size={16} /> مصفوفة المخاطر والاعتماد</span>
        <div className="bento-grid" style={{ margin: 0 }}>
          {Object.values(blueprint.governance).map((policy) => (
            <article className={`bento-card ${policy.level === "CRITICAL" ? "bento-card--red" : policy.level === "HIGH" ? "bento-card--amber" : ""}`} key={policy.level}>
              <h3>{policy.level}</h3>
              <p style={{ lineHeight: 1.8 }}>{policy.description}</p>
              <small>المعتمدون: {policy.approvers.length ? policy.approvers.join("، ") : "تنفيذ تلقائي داخل السياسة"}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="bento-grid">
        <article className="bento-card bento-2x" style={{ gap: 12 }}>
          <span className="bento-kicker"><Workflow size={16} /> البنية المؤسسية المستهدفة</span>
          <div className="bento-list">
            {blueprint.architecture.layers.map((layer, index) => (
              <div className="bento-list__row" key={layer}>
                <span>{index + 1}. {layer}</span>
                <span className="mini-pill">Layer</span>
              </div>
            ))}
          </div>
        </article>

        <article className="bento-card" style={{ gap: 10 }}>
          <span className="bento-kicker"><Gauge size={16} /> أهداف الأداء</span>
          <div className="bento-list">
            {blueprint.performance.targets.slice(0, 6).map((target) => (
              <div className="bento-list__row" key={target.id}>
                <span>{target.label}</span>
                <b>{target.target}</b>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="bento-card bento-full" style={{ gap: 12 }}>
        <span className="bento-kicker"><Activity size={16} /> خارطة التحول العالمية</span>
        <div className="report-stack">
          {blueprint.roadmap.map((phase) => (
            <article className="report-card" key={phase.id}>
              <h3 style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>المرحلة {phase.id}: {phase.name}</span>
                <small>{phase.horizon}</small>
              </h3>
              <pre>{[
                `الأهداف: ${phase.objectives.join(" | ")}`,
                `مقاييس النجاح: ${phase.successMetrics.join(" | ")}`,
              ].join("\n")}</pre>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note: string }) {
  return (
    <article className="bento-card">
      <span className="bento-kicker">{icon} {label}</span>
      <strong className="bento-value">{value.toLocaleString("ar-SA")}</strong>
      <span className="bento-label">{note}</span>
    </article>
  );
}
