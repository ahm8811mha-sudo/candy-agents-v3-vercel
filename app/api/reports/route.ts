import { NextRequest, NextResponse } from "next/server";
import { generateExecutiveReport, formatReportAsText, type ReportType } from "@/lib/reportGenerator";

export async function GET(req: NextRequest) {
  try {
    const type = (req.nextUrl.searchParams.get("type") || "DAILY").toUpperCase() as ReportType;
    const format = req.nextUrl.searchParams.get("format") || "json";

    if (!["DAILY", "WEEKLY", "MONTHLY"].includes(type)) {
      return NextResponse.json(
        { ok: false, error: "نوع التقرير غير صالح. الأنواع المتاحة: DAILY, WEEKLY, MONTHLY" },
        { status: 400 }
      );
    }

    const report = await generateExecutiveReport(type);

    if (format === "text") {
      return new NextResponse(formatReportAsText(report), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "تعذر إنشاء التقرير" },
      { status: 500 }
    );
  }
}
