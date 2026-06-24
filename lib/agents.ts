import { runAgent } from "./ai";
import { getSupabaseAdmin } from "./supabase";

export type AgentInput = {
  request: string;
  market: string;
  budget: number;
  timeframe?: string;
};

export type EmployeeResult = {
  name: string;
  role: string;
  output: string;
};

export type AgentPipelineResult = {
  runId: string;
  finalResult: string;
  employees: EmployeeResult[];
  saved: boolean;
};

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function logAgentRun(agentName: string, input: unknown, output: string, runId = newId("run")) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error: aiLogsError } = await supabase.from("ai_logs").insert({
    id: runId,
    type: agentName,
    content: output,
    metadata: { input },
  });

  if (!aiLogsError) return true;

  const { error: agentRunsError } = await supabase.from("agent_runs").insert({
    id: runId,
    agent_name: agentName,
    input: JSON.stringify(input),
    output,
    status: "COMPLETED",
  });

  return !agentRunsError;
}

async function marketEmployee(input: AgentInput) {
  const output = await runAgent(
    `
طلب صاحب الشركة:
${input.request}

مجال الشركة: ${input.market}
الميزانية: ${input.budget}
مدة التنفيذ: ${input.timeframe || "غير محددة"}

نفذ دورك كموظف تحليل. المطلوب:
- فهم الطلب
- تلخيص الوضع المطلوب فحصه
- تحديد البيانات أو الجوانب المهمة
- إعطاء ملاحظات عملية قصيرة
`,
    {
      agentName: "market_analyst_agent",
      system: "أنت موظف تحليل داخل شركة ذكاء اصطناعي. اكتب بالعربية وبشكل عملي ومختصر.",
    }
  );

  return { name: "موظف تحليل السوق", role: "تشخيص وفهم الطلب", output };
}

async function opportunityEmployee(input: AgentInput, analysis: string) {
  const output = await runAgent(
    `
طلب صاحب الشركة:
${input.request}

تحليل الموظف السابق:
${analysis}

نفذ دورك كموظف فرص. المطلوب:
- استخرج أفضل 3 إجراءات أو فرص عملية
- رتبها حسب الأثر وسهولة التنفيذ
- اذكر المخاطر لكل فرصة
`,
    {
      agentName: "opportunity_agent",
      system: "أنت موظف فرص داخل شركة ذكاء اصطناعي. لا تعط أفكارًا عامة؛ أعط خيارات قابلة للتنفيذ.",
    }
  );

  return { name: "موظف الفرص", role: "اختيار أفضل الإجراءات", output };
}

async function decisionEmployee(input: AgentInput, opportunities: string) {
  const output = await runAgent(
    `
طلب صاحب الشركة:
${input.request}

خيارات موظف الفرص:
${opportunities}

الميزانية: ${input.budget}

نفذ دورك كموظف قرار. المطلوب:
- اختر القرار التنفيذي الأفضل الآن
- اشرح سبب الاختيار
- حدد ما لا يجب فعله الآن
- حدد مؤشر نجاح واضح
`,
    {
      agentName: "decision_agent",
      system: "أنت موظف قرار تنفيذي. اختر قرارًا واحدًا واضحًا وابتعد عن العموميات.",
    }
  );

  return { name: "موظف القرار", role: "اعتماد المسار الأفضل", output };
}

async function executionEmployee(input: AgentInput, decision: string) {
  const output = await runAgent(
    `
طلب صاحب الشركة:
${input.request}

قرار موظف القرار:
${decision}

نفذ دورك كمدير تنفيذ. المطلوب:
- خطة تنفيذ مباشرة
- مهام محددة
- المسؤول أو الدور المطلوب لكل مهمة
- جدول زمني
- مخرجات التسليم
- نقاط مراجعة
`,
    {
      agentName: "execution_agent",
      system: "أنت مدير تنفيذ داخل شركة ذكاء اصطناعي. حوّل القرار إلى عمل واضح قابل للتسليم.",
    }
  );

  return { name: "موظف التنفيذ", role: "تحويل القرار إلى تسليم", output };
}

function buildFinalDelivery(input: AgentInput, employees: EmployeeResult[]) {
  const [analysis, opportunities, decision, execution] = employees;

  return `
تم تنفيذ الطلب

الطلب:
${input.request}

ملخص الإدارة:
تم توزيع الطلب على موظفي الذكاء الاصطناعي، وتم تحويله من طلب عام إلى قرار وخطة تنفيذ قابلة للمتابعة.

1. التشخيص
${analysis.output}

2. أفضل الإجراءات المقترحة
${opportunities.output}

3. القرار المعتمد
${decision.output}

4. خطة التنفيذ
${execution.output}

ما يجب فعله الآن:
- اعتماد الخطة أو تعديلها من صاحب القرار.
- تحويل المهام إلى مسؤولين وتواريخ تسليم.
- مراجعة التقدم أسبوعيًا.
- إرجاع النتيجة النهائية في نفس شاشة الطلب بدون الاعتماد على سجلات داخلية مشتتة.
`.trim();
}

export async function runFullAIFlow(input: AgentInput): Promise<AgentPipelineResult> {
  const runId = newId("request");
  const analysis = await marketEmployee(input);
  const opportunities = await opportunityEmployee(input, analysis.output);
  const decision = await decisionEmployee(input, opportunities.output);
  const execution = await executionEmployee(input, decision.output);
  const employees = [analysis, opportunities, decision, execution];
  const finalResult = buildFinalDelivery(input, employees);
  const saved = await logAgentRun("company_ai_request", input, finalResult, runId);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("inbox_items").insert({
      id: newId("inbox"),
      request_text: input.request,
      result_title: "تم تنفيذ الطلب",
      result_content: finalResult,
      assigned_agent: "company_ai_team",
      department_id: "exec",
      status: "DELIVERED",
    });
  }

  return { runId, finalResult, employees, saved };
}

export async function runMarketAnalyst(input: Pick<AgentInput, "market" | "budget" | "request" | "timeframe">) {
  return (await marketEmployee(input)).output;
}

export async function runOpportunityAgent(data: string) {
  return runAgent(data, { agentName: "opportunity_agent" });
}

export async function runDecisionAgent(opportunities: string, budget: number) {
  return runAgent(`الميزانية: ${budget}\n${opportunities}`, { agentName: "decision_agent" });
}

export async function runExecutionAgent(decision: string) {
  return runAgent(decision, { agentName: "execution_agent" });
}
