import { addTransaction, generateFinancialReport, getTransactions } from "@/lib/accountingSystem";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const report = await generateFinancialReport();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Accounting system failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "add") {
      const result = await addTransaction(body.data);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "list") {
      const transactions = await getTransactions();
      return NextResponse.json({ ok: true, transactions });
    }

    if (body.action === "report") {
      const report = await generateFinancialReport();
      return NextResponse.json({ ok: true, ...report });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Accounting system failed" }, { status: 500 });
  }
}
