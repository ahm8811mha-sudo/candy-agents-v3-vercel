import { generateOperationalAlerts } from "@/lib/alertEngine";
import { refreshGovernmentRegulations } from "@/lib/governmentRelations";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const authorizedBySecret = Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
    const authorizedVercelCron = !secret &&
      request.headers.get("user-agent") === "vercel-cron/1.0" &&
      Boolean(request.headers.get("x-vercel-id"));
    if (!authorizedBySecret && !authorizedVercelCron) {
      return NextResponse.json({ ok: false, error: "Unauthorized cron request" }, { status: 401 });
    }
    const government = await refreshGovernmentRegulations();
    const alerts = await generateOperationalAlerts();
    return NextResponse.json({ ok: true, government, alerts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Alert cron failed" },
      { status: 500 }
    );
  }
}
