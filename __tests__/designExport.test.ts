import { describe, it, expect } from "vitest";
import { renderReportHtml } from "../lib/designExport";
import type { ExecutiveReport } from "../lib/reportGenerator";

const sampleReport: ExecutiveReport = {
  type: "DAILY",
  generatedAt: new Date("2026-06-29T08:00:00Z").toISOString(),
  financialSummary: {
    income: 50000,
    expenses: 30000,
    profit: 20000,
    profitMargin: 0.4,
    healthScore: 82,
  },
  operationalSummary: {
    totalTasks: 12,
    completedTasks: 9,
    blockedTasks: 1,
    completionRate: 75,
  },
  alertsSummary: { critical: 0, high: 1, medium: 2, low: 3 },
  decisionPatterns: [],
  recommendations: ["مراجعة بنود الصرف", "زيادة الاستثمار في التسويق"],
  kpiHighlights: [
    { name: "نمو المبيعات", target: 100, current: 75, unit: "%", status: "ON_TRACK" },
  ],
};

describe("designExport", () => {
  it("produces a valid HTML document", () => {
    const html = renderReportHtml(sampleReport);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("</html>");
  });

  it("includes the Adobe Express import metadata", () => {
    const html = renderReportHtml(sampleReport);
    expect(html).toContain('hz:canvas-width');
    expect(html).toContain('hz:slide-selector');
    expect(html).toContain('class="report-slide"');
  });

  it("renders the health score and recommendations", () => {
    const html = renderReportHtml(sampleReport);
    expect(html).toContain("82%");
    expect(html).toContain("مراجعة بنود الصرف");
    expect(html).toContain("زيادة الاستثمار في التسويق");
  });

  it("renders KPI highlights when present", () => {
    const html = renderReportHtml(sampleReport);
    expect(html).toContain("نمو المبيعات");
    expect(html).toContain("75/100");
  });

  it("escapes HTML special characters in content", () => {
    const malicious: ExecutiveReport = {
      ...sampleReport,
      recommendations: ["<script>alert('x')</script>"],
    };
    const html = renderReportHtml(malicious);
    expect(html).not.toContain("<script>alert('x')</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles empty recommendations gracefully", () => {
    const empty: ExecutiveReport = { ...sampleReport, recommendations: [] };
    const html = renderReportHtml(empty);
    expect(html).toContain("لا توجد توصيات");
  });
});
