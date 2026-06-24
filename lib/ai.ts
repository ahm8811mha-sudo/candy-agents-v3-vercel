import OpenAI from "openai";

type AgentOptions = {
  agentName: string;
  system?: string;
};

function fallbackAgentOutput(agentName: string) {
  const names: Record<string, string> = {
    market_analyst_agent: "تحليل أولي: تم فهم الطلب وتحديد أن المطلوب هو تشخيص الوضع الحالي وتحويله إلى خطة تنفيذ. يلزم جمع بيانات المبيعات، المصروفات، العملاء، التشغيل، والموظفين قبل اعتماد القرار النهائي.",
    opportunity_agent: "فرص التنفيذ: 1) ضبط التشغيل الداخلي، 2) تحسين المبيعات والتحصيل، 3) بناء لوحة متابعة أسبوعية. الأولوية الأعلى هي ضبط التشغيل لأنه يؤثر على بقية الشركة.",
    decision_agent: "القرار: البدء بخطة تشغيل لمدة 90 يومًا تركز على ترتيب المهام، تحديد المسؤوليات، وربط كل طلب بمخرج واضح وتاريخ تسليم.",
    execution_agent: "التنفيذ: إنشاء قائمة مهام أسبوعية، تعيين مسؤول لكل مهمة، تحديد مؤشرات أداء، مراجعة أسبوعية، وتسليم تقرير تنفيذي نهائي لصاحب القرار.",
  };

  return names[agentName] || "تم تجهيز رد تجريبي منظم. لتفعيل تنفيذ AI الحقيقي يجب ضبط OPENAI_API_KEY في Vercel.";
}

export async function runAgent(prompt: string, options: AgentOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackAgentOutput(options.agentName);

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          options.system ||
          "أنت موظف ذكاء اصطناعي داخل شركة. نفذ المطلوب عمليًا، واكتب بالعربية، ولا تشرح أنك نموذج ذكاء اصطناعي.",
      },
      { role: "user", content: prompt },
    ],
  });

  return completion.choices[0]?.message?.content || "لم يتم إرجاع نتيجة من الموظف.";
}
