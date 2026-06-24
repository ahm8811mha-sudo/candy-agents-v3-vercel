import { formatCompanyDelivery, runCompanySystem } from "@/lib/aiCompany";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
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
