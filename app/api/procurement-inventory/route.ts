import {
  createInventoryItem,
  createPurchaseOrder,
  createSupplier,
  getProcurementInventoryOS,
  recordInventoryMovement,
  seedProcurementInventoryOS,
} from "@/lib/procurementInventory";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getProcurementInventoryOS();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Procurement failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "seed");
    const data = body.data || {};

    if (action === "seed") {
      await seedProcurementInventoryOS();
      return NextResponse.json({ ok: true, ...(await getProcurementInventoryOS()) });
    }
    if (action === "supplier") return NextResponse.json({ ok: true, result: await createSupplier(data) });
    if (action === "item") return NextResponse.json({ ok: true, result: await createInventoryItem(data) });
    if (action === "po") return NextResponse.json({ ok: true, result: await createPurchaseOrder(data) });
    if (action === "movement") return NextResponse.json({ ok: true, result: await recordInventoryMovement(data) });

    return NextResponse.json({ ok: false, error: "Invalid procurement action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Procurement action failed" }, { status: 500 });
  }
}
