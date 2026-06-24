import { getSupabaseAdmin } from "./supabase";

type DepartmentKey = "accounting" | "marketing" | "operations" | "supplyChain" | "decision";

export type CompanySystemResult = Record<DepartmentKey, string> & {
  request: string;
  saved: boolean;
};

const companyPolicies = `
- Respond as a real corporate department, not as a chatbot.
- Use structured sections and clear business logic.
- Include financial, operational, marketing, supply chain, and risk considerations where relevant.
- Recommendations must be realistic, actionable, and tied to the request.
- Avoid vague answers. If assumptions are needed, state them clearly.
`;

function fallbackReport(role: DepartmentKey, request: string) {
  const reports: Record<DepartmentKey, string> = {
    accounting: `
1. Budget Breakdown
- Initial budget should be divided into setup, operations, marketing, technology, and contingency.
- Keep 10-15% as reserve for unexpected costs.

2. Cost Allocation
- 35% launch and setup
- 25% marketing and acquisition
- 20% operations and tools
- 10% suppliers or inventory
- 10% contingency

3. ROI
- Measure ROI by gross margin, customer acquisition cost, payback period, and monthly net profit.

4. Risks
- Overspending before product-market validation
- Weak cash-flow tracking
- Underestimating recurring operating costs

5. Recommendation
- Approve a phased budget with weekly spend control and stop-loss checkpoints.
`.trim(),
    marketing: `
1. Market Analysis
- Validate demand before heavy spending.
- Identify competitors, price ranges, buyer pain points, and acquisition channels.

2. Target Audience
- Start with one primary segment and one secondary segment instead of broad targeting.

3. Strategy
- Launch with a focused offer, clear landing page, paid test campaigns, and referral follow-up.

4. Estimated Budget
- Allocate the first marketing budget to testing channels, not long-term branding.

5. KPIs
- Cost per lead, conversion rate, customer acquisition cost, average order value, repeat purchase rate.
`.trim(),
    operations: `
1. Execution Plan
- Convert the request into weekly deliverables.
- Assign one owner for each workstream.
- Track delivery, blockers, decisions, and approvals.

2. Resources
- Project owner, finance reviewer, marketing executor, operations coordinator, supplier/contact owner.

3. Timeline
- Week 1: scope and data collection
- Week 2-3: setup and vendor/channel validation
- Week 4: launch pilot
- Week 5-12: optimize and scale

4. Risks
- No owner per task
- No acceptance criteria
- Delayed decisions

5. Steps
- Define scope, assign owners, approve budget, launch pilot, review weekly.
`.trim(),
    supplyChain: `
1. Inventory Plan
- Start lean. Do not overstock before demand is validated.

2. Supplier Strategy
- Use at least two supplier options and compare price, reliability, payment terms, and delivery speed.

3. Logistics
- Define fulfillment process, packaging, shipping lead time, and return handling.

4. Risks
- Supplier delays
- Quality inconsistency
- Cash tied in slow-moving inventory

5. Optimization
- Track stock turnover, fulfillment time, defect rate, and supplier performance.
`.trim(),
    decision: `
1. Executive Summary
- The request is feasible if handled as a phased company project with finance, marketing, operations, and supply chain controls.

2. Strategic Decision
- Proceed with a controlled pilot before full launch.

3. Risks
- Budget leakage, unclear ownership, and launching without demand validation.

4. Final Decision
- Approved for phased execution with weekly reporting and a clear go/no-go checkpoint.
`.trim(),
  };

  return `${reports[role]}\n\nRequest reference:\n${request}`;
}

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
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are a corporate AI employee. Always respond professionally with structured reports, clear logic, and realistic business procedures. Write in Arabic unless the user requests otherwise.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || fallback;
}

async function accountant(task: string) {
  return runAI(
    `
${companyPolicies}

You are a Chief Financial Officer (CFO).

Request:
${task}

Respond with:
1. Budget Breakdown
2. Cost Allocation
3. Financial Risks
4. ROI Estimation
5. Final Recommendation
`,
    fallbackReport("accounting", task)
  );
}

async function marketing(task: string) {
  return runAI(
    `
${companyPolicies}

You are a Marketing Director.

Request:
${task}

Respond with:
1. Market Analysis
2. Target Audience
3. Strategy Plan
4. Estimated Budget
5. KPIs
`,
    fallbackReport("marketing", task)
  );
}

async function operations(task: string) {
  return runAI(
    `
${companyPolicies}

You are an Operations Manager.

Request:
${task}

Respond with:
1. Execution Plan
2. Resources Required
3. Timeline
4. Risks
5. Steps
`,
    fallbackReport("operations", task)
  );
}

async function supplyChain(task: string) {
  return runAI(
    `
${companyPolicies}

You are a Supply Chain Manager.

Request:
${task}

Respond with:
1. Inventory Plan
2. Suppliers Strategy
3. Logistics Plan
4. Risks
5. Optimization Plan
`,
    fallbackReport("supplyChain", task)
  );
}

async function ceoAdvisor(report: string, request: string) {
  return runAI(
    `
${companyPolicies}

You are a CEO Advisor.

User request:
${request}

Analyze the full department reports:

${report}

Respond with:
1. Executive Summary
2. Strategic Decision
3. Key Risks
4. Required Approvals
5. Final Decision
`,
    fallbackReport("decision", request)
  );
}

export async function runCompanySystem(request: string): Promise<CompanySystemResult> {
  const [accounting, marketingReport, operationsReport, supplyReport] = await Promise.all([
    accountant(request),
    marketing(request),
    operations(request),
    supplyChain(request),
  ]);

  const decision = await ceoAdvisor(
    `
Accounting:
${accounting}

Marketing:
${marketingReport}

Operations:
${operationsReport}

Supply Chain:
${supplyReport}
`,
    request
  );

  const supabase = getSupabaseAdmin();
  let saved = false;

  if (supabase) {
    const { error } = await supabase.from("company_logs").insert({
      request,
      accounting,
      marketing: marketingReport,
      operations: operationsReport,
      supply: supplyReport,
      final: decision,
    });
    saved = !error;
  }

  return {
    request,
    accounting,
    marketing: marketingReport,
    operations: operationsReport,
    supplyChain: supplyReport,
    decision,
    saved,
  };
}

export function formatCompanyDelivery(result: CompanySystemResult) {
  return `
تقرير الشركة التنفيذي

الطلب:
${result.request}

1. التقرير المالي
${result.accounting}

2. تقرير التسويق
${result.marketing}

3. تقرير العمليات
${result.operations}

4. تقرير سلسلة الإمداد والمخزون
${result.supplyChain}

5. قرار الإدارة التنفيذية
${result.decision}
`.trim();
}
