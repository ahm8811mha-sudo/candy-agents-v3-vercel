import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getApprovalCritical } from "@/lib/approvals";
import { spendItem, personName } from "@/lib/company/counterItems";
import {
  readSpendChain, spendReviewHistory, archivedMark, isChairmanActionable, isOwnerReadySpend,
  spendStop, spendHolder, spendOverdue, spendStageSince, SPEND_STAGE_SLA_HOURS,
} from "@/lib/company/spendChain";
import { typeLabel } from "@/lib/i18n/arLabels";

export const dynamic = "force-dynamic";

const STAGE_NAME: Record<string, string> = { finance: "المالية (عبدالرحمن)", governance: "الحوكمة (حارس)", ceo: "الرئيس التنفيذي (سلطان)" };
const NEXT_STEP: Record<string, string> = {
  department: "مذكرة القسم: الموضوع والبدائل والعائد والمخاطر",
  finance: "المراجعة المالية (عبدالرحمن) وفحص الحوكمة (حارس) بالتوازي",
  governance: "فحص الحوكمة (حارس) والمراجعة المالية (عبدالرحمن)",
  sultan: "توصية الرئيس التنفيذي (سلطان)",
  owner: "قرارك: اعتماد أو رفض",
  decided: "صدر القرار",
};

/** Older generators wrote the entity type in English inside the detail line. */
function arabicDetail(detail: string) {
  return detail.replace(/النوع ([a-z_]+)/g, (_, type: string) => `النوع ${typeLabel(type)}`);
}

/** GET: the file of one spend request: where it is, who holds it, every review, and whether the Chairman can decide it here. Never writes. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const item = await getApprovalCritical(decodeURIComponent(id), auth.context.tenantId);
    if (!item) return NextResponse.json({ ok: false, error: "الطلب غير موجود." }, { status: 404 });
    const chain = readSpendChain(item);
    const stop = spendStop(chain);
    const holder = spendHolder(item);
    const overdue = spendOverdue(item);
    const pending = item.status === "PENDING" || item.status === "DEFERRED";
    return NextResponse.json({
      ok: true,
      item: spendItem(item),
      detail: arabicDetail(item.detail || ""),
      approvalStatus: item.status,
      decidedAt: item.decidedAt || null,
      decisionNote: item.note || null,
      preparedBy: chain ? personName(chain.preparingAgentId === "department" ? holder : chain.preparingAgentId) : "",
      memo: chain ? { options: chain.options, expectedReturn: chain.expectedReturn, risks: chain.risks } : null,
      reviews: spendReviewHistory(chain).map((r) => ({ ...r, stageName: STAGE_NAME[r.stage] || r.stage, byName: personName(r.by) })),
      archived: archivedMark(item),
      position: chain ? {
        stage: chain.stage,
        holder,
        holderName: personName(holder),
        since: spendStageSince(item),
        slaHours: SPEND_STAGE_SLA_HOURS,
        overdueHours: overdue?.hours || 0,
        escalations: chain.escalation?.count || 0,
        nextStep: stop ? "إقفال الطلب بالرفض أو انتظار تصحيح القسم" : NEXT_STEP[chain.stage] || chain.stage,
      } : null,
      // The Chairman decides from this file only when the chain finished (or a reviewer stopped it).
      decision: {
        actionable: pending && !archivedMark(item) && (chain ? isChairmanActionable(chain) : true),
        canApprove: pending && !archivedMark(item) && (chain ? isOwnerReadySpend(chain) : true),
        stopped: stop ? { label: stop.label, reason: stop.reason, note: stop.note } : null,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "تعذر قراءة الطلب. حدّث الصفحة للمحاولة مجدداً." }, { status: 503 });
  }
}
