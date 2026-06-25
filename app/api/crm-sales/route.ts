import { convertLatestCampaignToLead, createActivity, createDeal, createLead, createSalesQuote, getCrmSalesOS, seedCrmSalesOS } from "@/lib/crmSales";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCrmSalesOS();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "CRM failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "seed");
    const data = body.data || {};

    if (action === "seed") {
      await seedCrmSalesOS();
      return NextResponse.json({ ok: true, ...(await getCrmSalesOS()) });
    }
    if (action === "lead") return NextResponse.json({ ok: true, result: await createLead(data) });
    if (action === "deal") return NextResponse.json({ ok: true, result: await createDeal(data) });
    if (action === "activity") return NextResponse.json({ ok: true, result: await createActivity(data) });
    if (action === "quote") return NextResponse.json({ ok: true, result: await createSalesQuote(data) });
    if (action === "campaign-lead") return NextResponse.json({ ok: true, result: await convertLatestCampaignToLead() });

    return NextResponse.json({ ok: false, error: "Invalid CRM action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "CRM action failed" }, { status: 500 });
  }
}
