import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { addTransaction, generateFinancialReport, getTransactions } from "@/lib/accountingSystem";
import {
  closeAccountingPeriod,
  createAccountingPeriod,
  getOpenInvoices,
  getTrialBalance,
  getVatSummary,
  listAccountingPeriods,
  reverseAccountingEntry,
} from "@/lib/accountingControls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function controlsSnapshot() {
  const [trialBalance, openInvoices, vatSummary, periods] = await Promise.all([
    getTrialBalance(),
    getOpenInvoices(),
    getVatSummary(),
    listAccountingPeriods(),
  ]);
  return { trialBalance, openInvoices, vatSummary, periods };
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  try {
    const [report, controls] = await Promise.all([
      generateFinancialReport(),
      controlsSnapshot(),
    ]);
    return NextResponse.json({ ok: true, ...report, controls });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Accounting system failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "add") {
      const result = await addTransaction(body.data);
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    if (action === "list") {
      const transactions = await getTransactions();
      return NextResponse.json({ ok: true, transactions });
    }

    if (action === "report") {
      const report = await generateFinancialReport();
      return NextResponse.json({ ok: true, ...report });
    }

    if (action === "controls") {
      return NextResponse.json({ ok: true, controls: await controlsSnapshot() });
    }

    if (action === "create_period") {
      const period = await createAccountingPeriod({
        name: String(body.name || ""),
        startsOn: String(body.startsOn || ""),
        endsOn: String(body.endsOn || ""),
      });
      return NextResponse.json({ ok: true, period }, { status: 201 });
    }

    if (action === "close_period") {
      const period = await closeAccountingPeriod({
        periodId: String(body.periodId || ""),
        actorId: auth.context.actor.id,
        note: body.note ? String(body.note) : undefined,
      });
      return NextResponse.json({ ok: true, period });
    }

    if (action === "reverse_entry") {
      const reversalEntryId = await reverseAccountingEntry({
        entryId: String(body.entryId || ""),
        reversalDate: String(body.reversalDate || new Date().toISOString().slice(0, 10)),
        reason: String(body.reason || ""),
        actorId: auth.context.actor.id,
      });
      return NextResponse.json({ ok: true, reversalEntryId }, { status: 201 });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Accounting system failed" },
      { status: 500 }
    );
  }
}
