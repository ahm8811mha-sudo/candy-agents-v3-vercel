import { NextRequest, NextResponse } from "next/server";
import { buildChairmanDigest } from "@/lib/company/chairmanDigest";
import { hydrateChairmanCommands } from "@/lib/company/chairmanCommands";
import { hydrateCompany } from "@/lib/company/hydrate";
import { projectStepsReport } from "@/lib/company/projectSteps";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";

export const dynamic = "force-dynamic";

/** Read-only poll for an external assistant. GET never writes. */
export async function GET(req: NextRequest) {
  const access = authorizeBridgeHeaders({
    pathname: req.nextUrl.pathname,
    agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
    chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
  });
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const since = req.nextUrl.searchParams.get("since") || "";
  try {
    // Read approvals and ideas from the DB here too; never trust a cold instance's memory.
    await Promise.all([hydrateChairmanCommands(), hydrateCompany()]);
    const digest = buildChairmanDigest(since);
    // Project steps count too: a digest that saw only commands read "0 overdue"
    // while project #5 had 13 late steps.
    const steps = await projectStepsReport().then((report) => report.totals).catch(() => null);
    return NextResponse.json({ ...digest, projectSteps: steps });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر بناء الملخص." }, { status: 500 });
  }
}
