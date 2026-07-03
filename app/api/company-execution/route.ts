import { runCompanyExecution } from "@/lib/companyExecutionSystem";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, AI_RATE_LIMIT } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for") || "anonymous";
    const { allowed, remaining } = checkRateLimit(`exec:${clientIp}`, AI_RATE_LIMIT);

    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "تم تجاوز الحد المسموح من الطلبات. حاول مجدداً بعد دقيقة." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
      );
    }

    const { request } = await req.json();
    const result = await runCompanyExecution(request);

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Company execution system failed",
      },
      { status: 500 }
    );
  }
}
