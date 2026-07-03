/**
 * Branded design export for executive reports.
 *
 * Converts an ExecutiveReport into a self-contained, RTL, print-ready HTML
 * document that matches the Candy Agents brand. The output:
 *   - opens directly in the browser and prints cleanly to PDF, and
 *   - is structured for import into Adobe Express via the HTML import flow
 *     (single fixed-canvas "slide" with inline styles, no external assets).
 */

import type { ExecutiveReport } from "./reportGenerator";

const BRAND = {
  bg: "#0c1118",
  panel: "#141b25",
  line: "rgba(255,255,255,0.1)",
  text: "#f5f7fb",
  muted: "#b0bac8",
  primary: "#2f80ed",
  green: "#38d39f",
  amber: "#f4b740",
  red: "#ef6461",
};

const typeLabels: Record<string, string> = {
  DAILY: "تقرير يومي",
  WEEKLY: "تقرير أسبوعي",
  MONTHLY: "تقرير شهري",
};

function sar(value: number): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function healthColor(score: number): string {
  return score >= 70 ? BRAND.green : score >= 40 ? BRAND.amber : BRAND.red;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function metricCard(label: string, value: string, accent: string): string {
  return `
    <div style="flex:1;min-width:160px;border:1px solid ${BRAND.line};border-radius:14px;background:${BRAND.panel};padding:18px;">
      <div style="color:${BRAND.muted};font-size:13px;font-weight:800;margin-bottom:8px;">${esc(label)}</div>
      <div style="color:${accent};font-size:26px;font-weight:900;">${esc(value)}</div>
    </div>`;
}

export function renderReportHtml(report: ExecutiveReport): string {
  const { financialSummary: f, operationalSummary: o, alertsSummary: a } = report;
  const generated = new Date(report.generatedAt).toLocaleString("ar-SA");
  const hColor = healthColor(f.healthScore);

  const recommendations = report.recommendations.length
    ? report.recommendations
        .map(
          (r, i) => `
        <div style="display:flex;gap:10px;align-items:flex-start;border:1px solid ${BRAND.line};border-radius:10px;background:${BRAND.panel};padding:12px 14px;margin-bottom:8px;">
          <div style="flex:0 0 24px;height:24px;border-radius:50%;background:${BRAND.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;">${i + 1}</div>
          <div style="color:${BRAND.text};line-height:1.7;">${esc(r)}</div>
        </div>`
        )
        .join("")
    : `<div style="color:${BRAND.muted};">لا توجد توصيات لهذه الفترة.</div>`;

  const kpis = report.kpiHighlights.length
    ? report.kpiHighlights
        .map(
          (k) => `
        <div style="flex:1;min-width:150px;border:1px solid ${BRAND.line};border-radius:10px;background:${BRAND.panel};padding:14px;">
          <div style="color:${BRAND.muted};font-size:12px;font-weight:800;margin-bottom:6px;">${esc(k.name)}</div>
          <div style="color:${BRAND.text};font-size:18px;font-weight:900;">${k.current}/${k.target} ${esc(k.unit)}</div>
        </div>`
        )
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="hz:canvas-width" content="1080" />
<meta name="hz:canvas-height" content="1350" />
<meta name="hz:slide-selector" content=".report-slide" />
<title>${esc(typeLabels[report.type] || "تقرير تنفيذي")} - Candy Agents</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800;900&display=swap");
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Cairo", system-ui, sans-serif; background: #06090d; }
  @media print { body { background: #fff; } .report-slide { box-shadow: none !important; } }
</style>
</head>
<body>
  <div class="report-slide" style="width:1080px;min-height:1350px;margin:0 auto;background:${BRAND.bg};color:${BRAND.text};padding:56px;">

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${BRAND.line};padding-bottom:24px;margin-bottom:32px;">
      <div>
        <div style="display:inline-flex;align-items:center;gap:10px;color:#7cc7ff;font-weight:900;font-size:15px;margin-bottom:10px;">
          <span style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.green});display:inline-flex;align-items:center;justify-content:center;color:#fff;">CA</span>
          Candy Agents
        </div>
        <div style="font-size:34px;font-weight:900;">${esc(typeLabels[report.type] || "تقرير تنفيذي")}</div>
      </div>
      <div style="text-align:left;color:${BRAND.muted};font-size:13px;font-weight:800;">
        <div>تاريخ الإنشاء</div>
        <div style="color:${BRAND.text};">${esc(generated)}</div>
      </div>
    </div>

    <!-- Health banner -->
    <div style="border:1px solid ${BRAND.line};border-radius:16px;background:${BRAND.panel};padding:28px;margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="color:${BRAND.muted};font-weight:800;margin-bottom:8px;">مؤشر الصحة المالية</div>
        <div style="color:${hColor};font-size:56px;font-weight:900;line-height:1;">${f.healthScore}%</div>
      </div>
      <div style="text-align:left;">
        <div style="color:${BRAND.muted};font-weight:800;margin-bottom:8px;">هامش الربح</div>
        <div style="font-size:32px;font-weight:900;">${Math.round(f.profitMargin * 100)}%</div>
      </div>
    </div>

    <!-- Financial metrics -->
    <div style="font-size:18px;font-weight:900;margin-bottom:14px;">الملخص المالي</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:28px;">
      ${metricCard("الإيرادات", sar(f.income), BRAND.green)}
      ${metricCard("المصروفات", sar(f.expenses), BRAND.red)}
      ${metricCard("صافي الربح", sar(f.profit), f.profit >= 0 ? BRAND.green : BRAND.red)}
    </div>

    <!-- Operational + alerts -->
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:28px;">
      ${metricCard("إجمالي المهام", String(o.totalTasks), BRAND.text)}
      ${metricCard("نسبة الإنجاز", `${o.completionRate}%`, BRAND.primary)}
      ${metricCard("مهام متوقفة", String(o.blockedTasks), o.blockedTasks > 0 ? BRAND.amber : BRAND.green)}
      ${metricCard("تنبيهات حرجة", String(a.critical), a.critical > 0 ? BRAND.red : BRAND.green)}
    </div>

    ${
      kpis
        ? `<div style="font-size:18px;font-weight:900;margin-bottom:14px;">مؤشرات الأداء الرئيسية</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;">${kpis}</div>`
        : ""
    }

    <!-- Recommendations -->
    <div style="font-size:18px;font-weight:900;margin-bottom:14px;">التوصيات التنفيذية</div>
    ${recommendations}

    <!-- Footer -->
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid ${BRAND.line};color:${BRAND.muted};font-size:12px;text-align:center;">
      تم إنشاء هذا التقرير آلياً بواسطة Candy Agents · نظام التشغيل التنفيذي بالذكاء الاصطناعي
    </div>

  </div>
</body>
</html>`;
}
