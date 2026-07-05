import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  return NextResponse.json({
    ok: true,
    openaiConfigured: Boolean(key),
    keyPrefix: key ? `${key.slice(0, 7)}...` : null,
    keyLength: key.length,
    model,
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelUrl: process.env.VERCEL_URL || null,
    nodeEnv: process.env.NODE_ENV || null,
  });
}
