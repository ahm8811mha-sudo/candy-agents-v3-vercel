import { runAgent } from "./ai";
import { getSupabaseAdmin } from "./supabase";

export type AgentInput = {
  market: string;
  budget: number;
  goal: string;
  timeframe?: string;
  riskLevel?: string;
};

export type AgentPipelineResult = {
  runId: string;
  marketResult: string;
  opportunityResult: string;
  decisionResult: string;
  executionResult: string;
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

export async function runMarketAnalyst(input: Pick<AgentInput, "market" | "budget" | "goal" | "timeframe" | "riskLevel">) {
  return runAgent(
    `
Analyze this market: ${input.market}
Budget: ${input.budget}
Goal: ${input.goal}
Timeframe: ${input.timeframe || "not specified"}
Risk level: ${input.riskLevel || "balanced"}

Give:
- Trends
- Demand level
- Competition
- Practical opportunities
- Key assumptions
`,
    {
      agentName: "market_analyst_agent",
      system: "You are the Market Analyst Agent in a business AI system. Be specific, commercial, and practical for a real company.",
    }
  );
}

export async function runOpportunityAgent(data: string) {
  return runAgent(
    `
Based on this data:
${data}

Find the top 3 business opportunities.
For each opportunity, explain:
- Profitability logic
- Startup cost
- Risk
- Speed to launch
- Why it fits the market
`,
    {
      agentName: "opportunity_agent",
      system: "You are the Opportunity Agent. Rank options with business discipline and reject vague ideas.",
    }
  );
}

export async function runDecisionAgent(opportunities: string, budget: number) {
  return runAgent(
    `
You are a CEO advisor.

Budget: ${budget}
Opportunities:
${opportunities}

Choose the best decision and explain why.
Include:
- Selected opportunity
- Why now
- Main risk
- Budget allocation
- Success metric
`,
    {
      agentName: "decision_agent",
      system: "You are the Decision Agent. Make one clear executive decision and defend it.",
    }
  );
}

export async function runExecutionAgent(decision: string) {
  return runAgent(
    `
You are an execution manager.

Decision:
${decision}

Break it into:
- Tasks
- Required roles or freelancers
- Timeline
- Budget checkpoints
- Weekly KPIs
- Approval points
`,
    {
      agentName: "execution_agent",
      system: "You are the Execution Agent. Convert decisions into tracked work that a company can run.",
    }
  );
}

export async function runFullAIFlow(input: AgentInput): Promise<AgentPipelineResult> {
  const runId = newId("pipeline");
  const marketResult = await runMarketAnalyst(input);
  const opportunityResult = await runOpportunityAgent(marketResult);
  const decisionResult = await runDecisionAgent(opportunityResult, input.budget);
  const executionResult = await runExecutionAgent(decisionResult);
  const final = [marketResult, opportunityResult, decisionResult, executionResult].join("\n\n---\n\n");
  const saved = await logAgentRun("full_ai_pipeline", input, final, runId);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("inbox_items").insert({
      id: newId("inbox"),
      request_text: input.goal,
      result_title: "خطة تنفيذ من نظام الوكلاء",
      result_content: final,
      assigned_agent: "full_ai_pipeline",
      department_id: "exec",
      status: "DELIVERED",
    });
  }

  return { runId, marketResult, opportunityResult, decisionResult, executionResult, saved };
}
