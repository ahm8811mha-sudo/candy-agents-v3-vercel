import { runCompanyExecution } from "@/lib/companyExecutionSystem";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { request } = await req.json();
    const result = await runCompanyExecution(request);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Company execution system failed",
      },
      { status: 500 }
    );
  }
}
