import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { hydrateCompany } from "@/lib/company/hydrate";
import { hydrateChairmanCommands, listChairmanCommands } from "@/lib/company/chairmanCommands";
import { listApprovals } from "@/lib/approvals";
import { archivedMark } from "@/lib/company/spendChain";
import { getAgent } from "@/lib/company/agents";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = { duplicate: "مكرر ودُمج في الأصل", returned_expired: "مضت سبعة أيام على الإعادة دون تصحيح", archived: "مؤرشف" };

/** GET: read-only archive. Archived (never deleted) requests, decided requests, and closed commands. */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  try {
    await Promise.all([hydrateCompany(), hydrateChairmanCommands()]);
    const all = listApprovals(undefined, { includeArchived: true });
    const archived = all.flatMap((item) => {
      const mark = archivedMark(item);
      return mark ? [{ id: item.id, title: item.title, amountSAR: item.amount ?? null, reason: REASON[mark.reason] || mark.reason, mergedInto: mark.mergedInto || null, at: mark.at, by: mark.by }] : [];
    }).sort((a, b) => b.at.localeCompare(a.at));
    const decided = all.filter((item) => !archivedMark(item) && (item.status === "APPROVED" || item.status === "REJECTED"))
      .map((item) => ({ id: item.id, title: item.title, amountSAR: item.amount ?? null, status: item.status, at: item.decidedAt || item.createdAt }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
    const closed = listChairmanCommands().filter((command) => command.status === "CLOSED")
      .map((command) => ({ id: command.id, subject: command.text, owner: getAgent(command.ownerAgentId)?.name || command.ownerAgentId, closedAt: command.closedAt || command.updatedAt, result: command.resultReport }))
      .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt))).slice(0, 60);
    return NextResponse.json({ ok: true, archived, decided, closed }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "تعذر قراءة الأرشيف. حدّث الصفحة للمحاولة مجدداً." }, { status: 503 });
  }
}
