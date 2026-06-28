"use client";

import { useState } from "react";
import { FileText, Loader2, Download, TrendingUp, AlertTriangle, Target } from "lucide-react";
import { HealthGauge, HorizontalBar, ProgressRing, StatusDistribution } from "./AnalyticsCharts";

type ReportData = {
  type: string;
  generatedAt: string;
  financialSummary: {
    income: number;
    expenses: number;
    profit: number;
    profitMargin: number;
    healthScore: number;
  };
  operationalSummary: {
    totalTasks: number;
    completedTasks: number;
    blockedTasks: number;
    completionRate: number;
  };
  alertsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  decisionPatterns: Array<{
    pattern: string;
    successRate: number;
    totalDecisions: number;
  }>;
  recommendations: string[];
  kpiHighlights: Array<{
    name: string;
    target: number;
    current: number;
    unit: string;
    status: string;
  }>;
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function ExecutiveReport() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState("DAILY");
  const [error, setError] = useState("");

  async function generateReport() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reports?type=${reportType}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر إنشاء التقرير");
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function downloadText() {
    try {
      const res = await fetch(`/api/reports?type=${reportType}&format=text`);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${reportType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    }
  }

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><FileText size={16} /> التقارير التنفيذية</span>
          <h2>مركز التقارير</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ width: "auto", minWidth: 120 }}
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            aria-label="نوع التقرير"
          >
            <option value="DAILY">يومي</option>
            <option value="WEEKLY">أسبوعي</option>
            <option value="MONTHLY">شهري</option>
          </select>
          <button className="primary-btn" onClick={generateReport} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <TrendingUp size={18} />}
            إنشاء التقرير
          </button>
          {report && (
            <button className="secondary-btn" onClick={downloadText}>
              <Download size={16} /> تحميل
            </button>
          )}
        </div>
      </div>

      {error && <p className="notice error">{error}</p>}

      {!report && !loading && (
        <div className="empty-state">
          <FileText size={34} />
          <strong>اختر نوع التقرير واضغط إنشاء</strong>
          <span>سيتم تحليل البيانات المالية والتشغيلية وإنشاء تقرير تنفيذي شامل</span>
        </div>
      )}

      {report && (
        <div className="fade-in">
          <div className="report-analytics-grid">
            <HealthGauge score={report.financialSummary.healthScore} label="مؤشر الصحة المالية" />
            <ProgressRing progress={report.operationalSummary.completionRate} label="نسبة إنجاز المهام" />
            <div className="metric-card green">
              <small>الإيرادات</small>
              <strong>{currency.format(report.financialSummary.income)}</strong>
            </div>
            <div className={`metric-card ${report.financialSummary.profit >= 0 ? "green" : "red"}`}>
              <small>صافي الربح</small>
              <strong>{currency.format(report.financialSummary.profit)}</strong>
            </div>
          </div>

          <div className="report-two-col" style={{ marginTop: 14 }}>
            <HorizontalBar
              title="الأداء المالي"
              data={[
                { label: "الإيرادات", value: report.financialSummary.income, color: "var(--green)" },
                { label: "المصروفات", value: report.financialSummary.expenses, color: "var(--red)" },
                { label: "الربح", value: Math.max(0, report.financialSummary.profit), color: "var(--primary)" },
              ]}
            />
            <StatusDistribution
              title="توزيع التنبيهات"
              data={[
                { label: "حرجة", value: report.alertsSummary.critical, color: "var(--red)" },
                { label: "عالية", value: report.alertsSummary.high, color: "#ff9f0a" },
                { label: "متوسطة", value: report.alertsSummary.medium, color: "var(--amber)" },
                { label: "منخفضة", value: report.alertsSummary.low, color: "var(--green)" },
              ]}
            />
          </div>

          {report.kpiHighlights.length > 0 && (
            <div className="report-section-box" style={{ marginTop: 14 }}>
              <div className="report-section-header">
                <Target size={18} style={{ color: "var(--primary)" }} />
                <strong>مؤشرات الأداء الرئيسية</strong>
              </div>
              <div className="report-kpi-grid">
                {report.kpiHighlights.map((kpi) => (
                  <div key={kpi.name} className="kpi-card-inner">
                    <small>{kpi.name}</small>
                    <strong>{kpi.current}/{kpi.target} {kpi.unit}</strong>
                    <span className={`mini-pill ${kpi.status.toLowerCase()}`} style={{ marginTop: 6, display: "inline-block" }}>{kpi.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.recommendations.length > 0 && (
            <div className="report-section-box" style={{ marginTop: 14 }}>
              <div className="report-section-header">
                <AlertTriangle size={18} style={{ color: "var(--amber)" }} />
                <strong>التوصيات</strong>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {report.recommendations.map((rec, i) => (
                  <div key={i} className="statement-row">
                    <span>{rec}</span>
                    <b>{i + 1}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
