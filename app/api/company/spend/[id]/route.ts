import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getApprovalCritical } from "@/lib/approvals";
import { spendItem, personName } from "@/lib/company/counterItems";
import { readSpendChain, spendReviewHistory, archivedMark } from "@/lib/company/spendChain";

export const dynamic = "force-dynamic";

const STAGE_NAME: Record<string, string> = { finance: "المالية (عبدالرحمن)", governance: "الحوكمة (حارس)", ceo: "الرئيس التنفيذي (سلطان)" };

/** GET: read-only file of one spend request: where it is, who holds it, and every review. Never writes. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const item = await getApprovalCritical(decodeURIComponent(id), auth.context.tenantId);
    if (!item) return NextResponse.json({ ok: false, error: "الطلب غير موجود." }, { status: 404 });
    const chain = readSpendChain(item);
    return NextResponse.json({
      ok: true,
      item: spendItem(item),
      detail: item.detail || "",
      approvalStatus: item.status,
      preparedBy: chain ? personName(chain.preparingAgentId) : "",
      memo: chain ? { options: chain.options, expectedReturn: chain.expectedReturn, risks: chain.risks } : null,
      reviews: spendReviewHistory(chain).map((r) => ({ ...r, stageName: STAGE_NAME[r.stage] || r.stage, byName: personName(r.by) })),
      archived: archivedMark(item),
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "تعذر قراءة الطلب. حدّث الصفحة للمحاولة مجدداً." }, { status: 503 });
  }
}
