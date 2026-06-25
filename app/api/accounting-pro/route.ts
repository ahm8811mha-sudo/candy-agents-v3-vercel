import {
  addBankTransaction,
  createAccountingInvoice,
  getAccountingConsole,
  postJournalEntry,
} from "@/lib/proAccounting";
import { seedEnterpriseOperatingSystem } from "@/lib/enterpriseSystems";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAccountingConsole();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Professional accounting failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "seed") {
      await seedEnterpriseOperatingSystem();
      const data = await getAccountingConsole();
      return NextResponse.json({ ok: true, ...data });
    }

    if (action === "journal") {
      const result = await postJournalEntry(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "invoice") {
      const result = await createAccountingInvoice(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "bank") {
      const result = await addBankTransaction(body.data);
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Invalid accounting action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Professional accounting action failed" },
      { status: 500 }
    );
  }
}
