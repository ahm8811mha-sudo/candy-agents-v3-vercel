import { NextResponse } from "next/server";
import { isAlpacaConfigured, getAccount, alpacaMode } from "@/lib/trading/brokers/alpaca";

export const dynamic = "force-dynamic";

/** GET: the connected broker account (balance / equity / buying power). */
export async function GET() {
  if (!isAlpacaConfigured()) {
    return NextResponse.json({ ok: true, configured: false, mode: alpacaMode() });
  }
  try {
    const account = await getAccount();
    return NextResponse.json({ ok: true, configured: true, account });
  } catch (error) {
    return NextResponse.json(
      { ok: false, configured: true, error: error instanceof Error ? error.message : "تعذّر قراءة الحساب من Alpaca" },
      { status: 500 }
    );
  }
}
