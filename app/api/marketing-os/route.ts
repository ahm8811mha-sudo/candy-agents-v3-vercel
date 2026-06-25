import {
  createABTest,
  createCampaignFromRadar,
  createContentCalendarItem,
  createMarketingCampaign,
  createMarketingOffer,
  createMarketingProduct,
  createMarketingSegment,
  createProactiveMarketingPlan,
  getMarketingOS,
  recordFunnelEvent,
} from "@/lib/marketingOS";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getMarketingOS();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Marketing OS failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "campaign");

    if (action === "campaign") {
      const result = await createMarketingCampaign(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "from-radar") {
      const result = await createCampaignFromRadar();
      return NextResponse.json({ ok: true, result });
    }

    if (action === "product") {
      const result = await createMarketingProduct(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "segment") {
      const result = await createMarketingSegment(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "offer") {
      const result = await createMarketingOffer(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "content") {
      const result = await createContentCalendarItem(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "ab-test") {
      const result = await createABTest(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "funnel-event") {
      const result = await recordFunnelEvent(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "proactive-plan") {
      const result = await createProactiveMarketingPlan();
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Invalid marketing action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Marketing action failed" },
      { status: 500 }
    );
  }
}
