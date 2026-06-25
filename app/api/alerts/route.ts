import { generateOperationalAlerts, getOperationalAlerts, updateOperationalAlert } from "@/lib/alertEngine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getOperationalAlerts();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Alerts failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "generate");

    if (action === "generate") {
      const result = await generateOperationalAlerts();
      return NextResponse.json({ ok: true, result });
    }

    if (action === "update") {
      const result = await updateOperationalAlert(String(body.id || ""), String(body.status || "RESOLVED"));
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Invalid alert action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Alert action failed" },
      { status: 500 }
    );
  }
}
