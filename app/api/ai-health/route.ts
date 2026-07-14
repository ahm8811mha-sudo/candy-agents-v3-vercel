import { NextResponse } from "next/server";
import { getAIProviderStatus } from "@/lib/ai";
import { aiUsageSummary } from "@/lib/aiUsage";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getAIProviderStatus();
  return NextResponse.json({
    ok: true,
    ...status,
    usage: aiUsageSummary(),
    env: {
      AI_PROVIDER: process.env.AI_PROVIDER || null,
      GEMINI_MODEL: process.env.GEMINI_MODEL || null,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || null,
      OPENAI_MODEL: process.env.OPENAI_MODEL || null,
    },
    keyHints: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.slice(0, 6)}...` : null,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `${process.env.ANTHROPIC_API_KEY.slice(0, 6)}...` : null,
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? `${process.env.CLAUDE_API_KEY.slice(0, 6)}...` : null,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.slice(0, 7)}...` : null,
    },
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelUrl: process.env.VERCEL_URL || null,
    nodeEnv: process.env.NODE_ENV || null,
  });
}
