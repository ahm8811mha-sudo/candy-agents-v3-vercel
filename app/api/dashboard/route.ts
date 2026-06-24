import { calculateFinancials } from "@/lib/accountingSystem";
import { getDashboardData } from "@/lib/companyExecutionSystem";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [dashboard, financials] = await Promise.all([
      getDashboardData(),
      calculateFinancials(),
    ]);

    return NextResponse.json({
      ok: true,
      ...dashboard,
      financials,
    });
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
