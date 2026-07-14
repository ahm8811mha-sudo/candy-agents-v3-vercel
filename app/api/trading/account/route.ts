import { NextResponse } from "next/server";
import { getAccount, getAlpacaReadiness } from "@/lib/trading/brokers/alpaca";

export const dynamic = "force-dynamic";

/** GET: the connected broker account (balance / equity / buying power). */
export async function GET() {
  const readiness = getAlpacaReadiness();
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const deployment = {
    environment,
    isPreview: environment === "preview",
    productionUrl: productionHost ? `https://${productionHost}` : null,
  };
  if (!readiness.configured) {
    return NextResponse.json({ ok: true, ...readiness, deployment });
  }
  try {
    const account = await getAccount();
    return NextResponse.json({ ok: true, ...readiness, account, deployment });
  } catch (error) {
    return NextResponse.json(
      { ok: false, ...readiness, error: error instanceof Error ? error.message : "تعذّر قراءة الحساب من Alpaca", deployment },
      { status: 502 }
    );
  }
}
