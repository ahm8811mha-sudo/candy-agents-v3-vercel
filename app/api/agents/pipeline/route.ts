import { formatCompanyDelivery, runCompanySystem } from "@/lib/aiCompany";
import { checkRateLimitShared, AI_RATE_LIMIT } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "anonymous";
}

export async function POST(req: Request) {
  try {
    const limit = await checkRateLimitShared(`pipeline:${clientKey(req)}`, AI_RATE_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, message: "تجاوزت حد الطلبات الذكية للدقيقة. أعد المحاولة بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await req.json();
    const request = String(body.request || body.goal || "").trim();

    if (!request) {
      return NextResponse.json({ ok: false, message: "اكتب الطلب الذي تريد تنفيذه." }, { status: 400 });
    }

    const result = await runCompanySystem(request);
    const finalResult = formatCompanyDelivery(result);

    return NextResponse.json({
      ok: true,
      runId: `company-${Date.now()}`,
      finalResult,
      employees: [
        { name: "الإدارة المالية", role: "المحاسبة والميزانية", output: result.accounting },
        { name: "إدارة التسويق", role: "السوق والنمو", output: result.marketing },
        { name: "إدارة العمليات", role: "التنفيذ والموارد", output: result.operations },
        { name: "سلسلة الإمداد", role: "المخزون والموردون", output: result.supplyChain },
        { name: "مستشار الرئيس التنفيذي", role: "القرار النهائي", output: result.decision },
      ],
      saved: result.saved,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تنفيذ الطلب." }, { status: 500 });
  }
}
