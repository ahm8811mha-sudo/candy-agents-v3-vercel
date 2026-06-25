import { calculateFinancials } from "@/lib/accountingSystem";
import { evaluateBusiness } from "@/lib/businessBrain";
import { getDashboardData } from "@/lib/companyExecutionSystem";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [dashboard, financials] = await Promise.all([
      getDashboardData(),
      calculateFinancials(),
    ]);
    const commandCenter = evaluateBusiness("تشغيل يومي للشركة", financials);

    return NextResponse.json({
      ok: true,
      ...dashboard,
      financials,
      commandCenter,
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
