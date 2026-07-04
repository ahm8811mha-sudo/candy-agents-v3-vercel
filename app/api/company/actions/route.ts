import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { listCompanyActions, updateCompanyActionStatus, type CompanyActionStatus } from "@/lib/company/actionQueue";
import { hydrateCompany } from "@/lib/company/hydrate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await hydrateCompany();
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const actions = await listCompanyActions(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50);
    return NextResponse.json({ ok: true, actions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list company actions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const status = String(body.status || "") as CompanyActionStatus;
    const allowed: CompanyActionStatus[] = ["QUEUED", "WAITING_APPROVAL", "WAITING_INTEGRATION", "RUNNING", "DONE", "FAILED", "CANCELLED"];

    if (!id || !allowed.includes(status)) {
      return NextResponse.json({ ok: false, error: "يلزم id وحالة صحيحة للإجراء." }, { status: 400 });
    }

    const user = await authenticateRequest(req);
    const action = await updateCompanyActionStatus({
      id,
      status,
      actor: user?.name || String(body.actor || "system"),
      result: body.result && typeof body.result === "object" ? body.result : undefined,
      error: body.error ? String(body.error) : undefined,
      note: body.note ? String(body.note) : undefined,
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update company action" },
      { status: 500 }
    );
  }
}
