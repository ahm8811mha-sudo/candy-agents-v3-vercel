import { calculateFinancials, type Financials } from "./accountingSystem";
import { getSupabaseAdmin } from "./supabase";

type FinanceDecisionResult = {
  financials: Financials;
  cfo: string;
  ceo: string;
  saved: boolean;
};

async function runAI(prompt: string, fallback: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a professional corporate executive AI. Respond in Arabic with structured, realistic business reports and clear financial logic.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || fallback;
}

async function getFinancialData() {
  return calculateFinancials();
}

function cfoFallback(financials: Financials, request: string) {
  const budgetStatus =
    financials.profit > 0
      ? "يوجد فائض تشغيلي يمكن دراسته، لكن لا يعتمد أي صرف قبل تحديد سقف مخاطرة وربط الإنفاق بعائد واضح."
      : "لا توجد قدرة مالية كافية حاليا، ويجب تأجيل أي التزام جديد أو تخفيض نطاق الطلب.";

  const recommendation =
    financials.profit >= 50000
      ? "Adjusted - موافقة مشروطة بتقسيم الصرف على مراحل وقياس العائد."
      : financials.profit > 0
        ? "Adjusted - تنفيذ محدود بميزانية تجريبية صغيرة قبل التوسع."
        : "Rejected - رفض مؤقت حتى يتحسن التدفق النقدي.";

  return `
## CFO Report

### 1. Budget Availability
${budgetStatus}

### 2. Financial Impact
الإيرادات الحالية: ${financials.income.toLocaleString("ar-SA")} ريال.
المصروفات الحالية: ${financials.expenses.toLocaleString("ar-SA")} ريال.
صافي الربح: ${financials.profit.toLocaleString("ar-SA")} ريال.
الطلب محل الدراسة: ${request}

### 3. Risk Analysis
- خطر استهلاك السيولة إذا تم تنفيذ الطلب دفعة واحدة.
- خطر عدم وجود عائد قابل للقياس خلال أول 30 إلى 60 يوم.
- ضرورة فصل ميزانية التجربة عن مصاريف التشغيل الأساسية.

### 4. ROI Estimate
العائد المتوقع يجب ألا يقل عن 20% إلى 30% خلال دورة تشغيل واضحة، مع إيقاف الصرف إذا لم تظهر مؤشرات نمو مبكرة.

### 5. Approval Recommendation
${recommendation}
`.trim();
}

function ceoFallback(cfoReport: string, request: string) {
  return `
## CEO Decision

### 1. Executive Summary
تمت مراجعة الطلب بناء على تقرير المدير المالي. القرار التنفيذي يجب أن يحافظ على السيولة ويحول الطلب إلى مبادرة قابلة للقياس.

### 2. Final Decision
Modify - تنفيذ معدل ومشروط، وليس اعتمادا مفتوحا.

### 3. Strategic Reason
الطلب "${request}" يمكن أن يكون مفيدا إذا تم تنفيذه على مراحل، لكن الشركة تحتاج إلى حماية الربحية الحالية وربط كل دفعة إنفاق بمؤشر أداء واضح.

### 4. Action Plan
- تحديد ميزانية مرحلة أولى لا تتجاوز 25% من المبلغ المطلوب.
- وضع مؤشرات نجاح مالية وتشغيلية قبل الصرف.
- مراجعة النتائج بعد 14 يوم عمل.
- إيقاف أو توسيع الخطة بناء على تقرير CFO التالي.

### CFO Reference
${cfoReport}
`.trim();
}

async function CFOAnalysis(financials: Financials, request: string) {
  return runAI(
    `
You are a Chief Financial Officer (CFO).

Company Financials:
Revenue: ${financials.income}
Expenses: ${financials.expenses}
Profit: ${financials.profit}
Transaction Count: ${financials.transactionCount}

User Request:
${request}

Respond with:
1. Budget Availability
2. Financial Impact
3. Risk Analysis
4. ROI Estimate
5. Approval Recommendation (Approved / Rejected / Adjusted)

Rules:
- Use realistic financial logic.
- Mention conditions for approval.
- Avoid generic advice.
- Write in Arabic.
`,
    cfoFallback(financials, request)
  );
}

async function CEODecision(cfoReport: string, request: string) {
  return runAI(
    `
You are a CEO of a company.

CFO Report:
${cfoReport}

Request:
${request}

Make a FINAL decision.

Respond with:
1. Executive Summary
2. Final Decision (Approve / Reject / Modify)
3. Strategic Reason
4. Action Plan

Rules:
- Base the decision on CFO logic.
- Make a clear decision.
- Write in Arabic.
`,
    ceoFallback(cfoReport, request)
  );
}

export async function runFinanceDecisionSystem(request: string): Promise<FinanceDecisionResult> {
  if (!request?.trim()) {
    throw new Error("نص الطلب المالي مطلوب.");
  }

  const financials = await getFinancialData();
  const cfo = await CFOAnalysis(financials, request.trim());
  const ceo = await CEODecision(cfo, request.trim());

  let saved = false;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("financial_decisions").insert({
      request: request.trim(),
      financials,
      cfo_report: cfo,
      ceo_decision: ceo,
    });
    if (error) throw error;
    saved = true;
  }

  return {
    financials,
    cfo,
    ceo,
    saved,
  };
}
