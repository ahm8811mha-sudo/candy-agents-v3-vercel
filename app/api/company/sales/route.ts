import { NextRequest, NextResponse } from "next/server";
import { getSalesConsole, proposeIncomeRecognition, proposeSalesChange } from "@/lib/company/sales";

export const dynamic = "force-dynamic";

/** GET: the sales console (Shopify snapshot + income recognition status). */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSalesConsole()) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sales console failed" },
      { status: 500 }
    );
  }
}

/** POST: propose income recognition, or propose a store change. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "recognize-income") {
      return NextResponse.json(await proposeIncomeRecognition());
    }

    if (body.action === "propose-change") {
      const kind = ["PRICE", "STATUS", "DISCOUNT"].includes(body.kind) ? body.kind : null;
      if (!kind) return NextResponse.json({ ok: false, error: "نوع التعديل غير صالح" }, { status: 400 });
      return NextResponse.json(proposeSalesChange({ kind, target: String(body.target || ""), detail: String(body.detail || "") }));
    }

    return NextResponse.json({ ok: false, error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sales action failed" },
      { status: 500 }
    );
  }
}
