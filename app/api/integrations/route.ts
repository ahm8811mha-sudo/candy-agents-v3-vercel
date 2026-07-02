import { NextResponse } from "next/server";
import { getAvailableIntegrations, getEnabledIntegrations } from "@/lib/integrations";

export async function GET() {
  try {
    const available = getAvailableIntegrations();
    const enabled = getEnabledIntegrations();

    return NextResponse.json({
      ok: true,
      integrations: available,
      enabledCount: enabled.length,
      totalCount: available.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "خطأ" },
      { status: 500 }
    );
  }
}
