import { runCompanySystem } from "@/lib/aiCompany";
import { checkRateLimitShared, AI_RATE_LIMIT } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "anonymous";
}

export async function POST(req: Request) {
  try {
    const limit = await checkRateLimitShared(`company:${clientKey(req)}`, AI_RATE_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "تجاوزت حد الطلبات الذكية للدقيقة. أعد المحاولة بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
      );
    }

    const { request } = await req.json();
    const cleanRequest = String(request || "").trim();

    if (!cleanRequest) {
      return NextResponse.json({ ok: false, error: "اكتب الطلب المطلوب تنفيذه." }, { status: 400 });
    }

    const result = await runCompanySystem(cleanRequest);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "System failed" }, { status: 500 });
  }
}
