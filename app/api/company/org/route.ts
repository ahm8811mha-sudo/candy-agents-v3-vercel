import { NextResponse } from "next/server";
import { COMPANY_AGENTS } from "@/lib/company/agents";
import { AUTHORITY_MATRIX } from "@/lib/company/governance";

export const dynamic = "force-dynamic";

/** GET: the official org structure + the financial authority matrix. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    agents: COMPANY_AGENTS,
    matrix: AUTHORITY_MATRIX.map((r) => ({
      ...r,
      maxSAR: Number.isFinite(r.maxSAR) ? r.maxSAR : null,
    })),
  });
}
