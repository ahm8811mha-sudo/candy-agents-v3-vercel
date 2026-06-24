import { getDashboardData } from "@/lib/companyExecutionSystem";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Dashboard data failed",
      },
      { status: 500 }
    );
  }
}
