import { NextResponse } from "next/server";
import { getMonitoringSnapshot, isVercelConfigured } from "@/lib/vercelMonitor";
import { withCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await withCache("vercel-monitoring", 30_000, getMonitoringSnapshot);
    return NextResponse.json({
      ok: true,
      configured: isVercelConfigured(),
      ...snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Monitoring fetch failed" },
      { status: 500 }
    );
  }
}
