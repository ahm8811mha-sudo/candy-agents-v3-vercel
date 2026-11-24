import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { listApprovals } from "@/lib/approvals";
import { hydrateCompany } from "@/lib/company/hydrate";
import { spendItem } from "@/lib/company/counterItems";
import { collapseDuplicates, isArchived, isMonetarySpend, isOwnerReadySpend, linkedProjectId, readSpendChain, returnedToDepartment } from "@/lib/company/spendChain";

export const dynamic = "force-dynamic";

/** GET: the Chairman's decisions file: every spend request, where it is, Sultan's best option, its project. Never writes. */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  try {
    await hydrateCompany();
    const since = Date.now() - 90 * 86_400_000;
    const rows = collapseDuplicates(listApprovals().filter((a) => isMonetarySpend(a.amount) && !isArchived(a)
      && (a.status === "PENDING" || a.status === "DEFERRED" || Date.parse(a.decidedAt || a.createdAt) >= since)));
    const decisions = rows.map((a) => {
      const chain = readSpendChain(a);
      const best = chain?.optionSet?.find((o) => o.recommended) || null;
      const projectId = linkedProjectId(a);
      const group = a.status === "APPROVED" || a.status === "REJECTED" ? "decided" : isOwnerReadySpend(chain) ? "awaiting" : returnedToDepartment(a) ? "returned" : "chain";
      return {
        ...spendItem(a), group, approvalStatus: a.status, decidedAt: a.decidedAt || null, decisionNote: a.note || null,
        bestOption: best ? { key: best.key, label: best.label, score: best.score, amountSAR: best.amountSAR } : null,
        optionsCount: chain?.optionSet?.length || 0,
        project: projectId ? { id: projectId, href: `/projects?project=${encodeURIComponent(projectId)}` } : null,
        fileHref: `/spend/${encodeURIComponent(a.id)}`,
      };
    }).sort((x, y) => String(y.updatedAt || y.createdAt).localeCompare(String(x.updatedAt || x.createdAt)));
    return NextResponse.json({ ok: true, decisions }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "تعذر قراءة ملف القرارات. حدّث الصفحة." }, { status: 503 });
  }
}
