import OpenAI from "openai";

type AgentOptions = {
  agentName: string;
  system?: string;
};

type ProviderName = "gemini" | "claude" | "openai" | "fallback";

const DEFAULT_SYSTEM = "أنت موظف ذكاء اصطناعي داخل شركة. نفذ المطلوب عمليًا، واكتب بالعربية، ولا تشرح أنك نموذج ذكاء اصطناعي.";
const DEFAULT_GEMINI_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"];

function fallbackAgentOutput(agentName: string) {
  const names: Record<string, string> = {
    market_analyst_agent: "تحليل أولي: تم فهم الطلب وتحديد أن المطلوب هو تشخيص الوضع الحالي وتحويله إلى خطة تنفيذ. يلزم جمع بيانات المبيعات، المصروفات، العملاء، التشغيل، والموظفين قبل اعتماد القرار النهائي.",
    opportunity_agent: "فرص التنفيذ: 1) ضبط التشغيل الداخلي، 2) تحسين المبيعات والتحصيل، 3) بناء لوحة متابعة أسبوعية. الأولوية الأعلى هي ضبط التشغيل لأنه يؤثر على بقية الشركة.",
    decision_agent: "القرار: البدء بخطة تشغيل لمدة 90 يومًا تركز على ترتيب المهام، تحديد المسؤوليات، وربط كل طلب بمخرج واضح وتاريخ تسليم.",
    execution_agent: "التنفيذ: إنشاء قائمة مهام أسبوعية، تعيين مسؤول لكل مهمة، تحديد مؤشرات أداء، مراجعة أسبوعية، وتسليم تقرير تنفيذي نهائي لصاحب القرار.",
  };

  return names[agentName] || "تم تجهيز رد تجريبي منظم. لتفعيل تنفيذ AI الحقيقي اضبط AI_PROVIDER مع مفتاح Gemini أو Claude أو OpenAI في Vercel.";
}

function selectedProvider(): ProviderName {
  const explicit = String(process.env.AI_PROVIDER || "").toLowerCase();
  if (["gemini", "claude", "openai"].includes(explicit)) return explicit as ProviderName;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "fallback";
}

function geminiModels() {
  const configured = [process.env.GEMINI_MODEL, ...(process.env.GEMINI_FALLBACK_MODELS || "").split(",")]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set([...configured, ...DEFAULT_GEMINI_MODELS]));
}

function extractGeminiText(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part: any) => part?.text || "").filter(Boolean).join("\n").trim();
}

function extractClaudeText(data: any) {
  const parts = data?.content || [];
  return parts.map((part: any) => part?.text || "").filter(Boolean).join("\n").trim();
}

function shouldTryNextGeminiModel(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return message.includes("high demand") || message.includes("try again later") || message.includes("resource_exhausted") || message.includes("429") || message.includes("quota");
}

async function runGeminiModel(model: string, prompt: string, options: AgentOptions) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.system || DEFAULT_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 900 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Gemini API error ${res.status}`);
  return extractGeminiText(data) || `لم يتم إرجاع نتيجة من Gemini عبر ${model}.`;
}

async function runGemini(prompt: string, options: AgentOptions) {
  let lastError: unknown = null;
  for (const model of geminiModels()) {
    try {
      return await runGeminiModel(model, prompt, options);
    } catch (error) {
      lastError = error;
      if (!shouldTryNextGeminiModel(error)) break;
    }
  }
  throw lastError || new Error("Gemini failed");
}

async function runClaude(prompt: string, options: AgentOptions) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing");
  const model = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || "claude-3-5-haiku-latest";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.25,
      system: options.system || DEFAULT_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Claude API error ${res.status}`);
  return extractClaudeText(data) || "لم يتم إرجاع نتيجة من Claude.";
}

async function runOpenAI(prompt: string, options: AgentOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: 900,
    messages: [
      { role: "system", content: options.system || DEFAULT_SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  return completion.choices[0]?.message?.content || "لم يتم إرجاع نتيجة من OpenAI.";
}

function providerErrorMessage(provider: ProviderName, error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0;
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  const name = provider === "gemini" ? "Gemini" : provider === "claude" ? "Claude" : "OpenAI";

  if (provider === "gemini" && (lower.includes("high demand") || lower.includes("try again later"))) {
    return "تعذر تنفيذ AI الحقيقي عبر Gemini لأن جميع موديلات Gemini المتاحة مزدحمة مؤقتًا. جرّب بعد دقيقة، أو أضف مزودًا احتياطيًا مثل Groq/Claude لاحقًا.";
  }
  if (lower.includes("quota") || lower.includes("resource_exhausted") || message.includes("429") || status === 429) {
    return `تعذر تنفيذ AI الحقيقي عبر ${name} بسبب الرصيد أو حدود الاستخدام. راجع Billing / Usage Limits في حساب المزود ثم أعد المحاولة.`;
  }
  if (lower.includes("api key") || message.includes("401") || status === 401) {
    return `تعذر تنفيذ AI الحقيقي عبر ${name} لأن المفتاح غير صحيح أو غير مضاف في Vercel.`;
  }
  return `تعذر تنفيذ AI الحقيقي عبر ${name}: ${message.slice(0, 240)}`;
}

export async function runAgent(prompt: string, options: AgentOptions) {
  const provider = selectedProvider();
  if (provider === "fallback") return fallbackAgentOutput(options.agentName);

  try {
    if (provider === "gemini") return await runGemini(prompt, options);
    if (provider === "claude") return await runClaude(prompt, options);
    return await runOpenAI(prompt, options);
  } catch (error) {
    return providerErrorMessage(provider, error);
  }
}

export function getAIProviderStatus() {
  const provider = selectedProvider();
  return {
    provider,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    claudeConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model:
      provider === "gemini"
        ? geminiModels()[0]
        : provider === "claude"
          ? process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || "claude-3-5-haiku-latest"
          : process.env.OPENAI_MODEL || "gpt-4o-mini",
    geminiFallbackModels: provider === "gemini" ? geminiModels().slice(1) : [],
  };
}
