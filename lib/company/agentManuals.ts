import manuals from "./agent-manuals.json";

export const AGENT_MANUALS = manuals as Record<string, string>;

/** Role-based task agents used by the app, mapped onto the named employees. */
export const TASK_AGENT_TO_EMPLOYEE: Record<string, string | readonly string[]> = {
  finance_feasibility_agent: "abdulrahman",
  market_strategy_agent: "noura",
  market_analyst_agent: "noura",
  operations_execution_agent: "fahad",
  execution_agent: "fahad",
  initiative_execution_agent: "fahad",
  procurement_agent: "khalid",
  risk_agent: "hares",
  decision_agent: "sultan",
  ceo_agent: "sultan",
  opportunity_agent: "rased",
  feasibility_agent: ["abdulrahman", "noura", "fahad"],
};

const LIVE_LINE = "أنت مربوط ببيانات أورفانتا المباشرة المتاحة لدورك في النظام. استخدمها، وإذا نقص شيء فحدّده مرة واحدة واطلبه من سجلات الشركة.";
const LIVE_LINE_FEMININE = "أنتِ مربوطة ببيانات أورفانتا المباشرة المتاحة لدورك في النظام. استخدميها، وإذا نقص شيء فحدّديه مرة واحدة واطلبيه من سجلات الشركة.";

const DISCONNECTED = [
  /أنت حاليًا غير مربوط ببيانات موقع أورفانتا المباشرة\.[^\n]*/g,
  /أنتِ حاليًا غير مربوطة ببيانات موقع أورفانتا المباشرة\.[^\n]*/g,
  /عند نقص البيانات \(النظام غير مربوط بعد بالموقع المباشر\)[^\n]*/g,
];

export function liveManual(agentId: string): string | null {
  const source = AGENT_MANUALS[agentId];
  if (!source) return null;
  const feminine = source.includes("أنتِ");
  let text = source;
  for (const pattern of DISCONNECTED) {
    text = text.replace(pattern, feminine ? LIVE_LINE_FEMININE : LIVE_LINE);
  }
  return text.trim();
}

export function resolveManualAgents(agentName: string | undefined): string[] {
  if (!agentName) return [];
  const mapped = TASK_AGENT_TO_EMPLOYEE[agentName];
  if (typeof mapped === "string") return [mapped];
  if (Array.isArray(mapped)) return [...mapped];
  if (AGENT_MANUALS[agentName]) return [agentName];
  const correspondence = agentName.match(/^correspondence_([a-z]+)_agent$/);
  if (correspondence && AGENT_MANUALS[correspondence[1]]) return [correspondence[1]];
  return [];
}

/** Manual first, task instructions after. Disconnected-from-live-data lines are replaced. */
export function composeAgentSystemPrompt(agentName: string | undefined, taskSystem?: string): string {
  const ids = resolveManualAgents(agentName);
  const task = (taskSystem || "").trim();
  if (ids.length === 0) return task;
  const bodies = ids.map((id) => liveManual(id)).filter((text): text is string => Boolean(text));
  if (bodies.length === 0) return task;
  const head = ids.length > 1
    ? `تعمل كلجنة من الموظفين الآتي ذكرهم. أجب بصوت كل واحد حسب دليله، ولا تخلط أدوارهم.\n\n${bodies.join("\n\n-----\n\n")}`
    : bodies[0];
  if (!task) return head;
  return `${head}\n\n-----\nتعليمات هذه المهمة:\n${task}`;
}
