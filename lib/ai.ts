import OpenAI from "openai";

type AgentOptions = {
  agentName: string;
  system?: string;
};

export async function runAgent(prompt: string, options: AgentOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return `AI service is not configured. Missing OPENAI_API_KEY.\n\nAgent: ${options.agentName}\n\nPrompt:\n${prompt}`;
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: options.system || "You are a practical business AI agent. Return concise, structured, actionable output." },
      { role: "user", content: prompt },
    ],
  });

  return completion.choices[0]?.message?.content || "No output returned.";
}
