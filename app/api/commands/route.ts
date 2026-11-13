import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import {
  decideChairmanCommand,
  hydrateChairmanCommands,
  issueChairmanCommand,
  listChairmanCommands,
  publicCommandStatus,
  type ChairmanDecisionChoice,
} from "@/lib/company/chairmanCommands";
import { buildDecisionDesk } from "@/lib/company/decisionDesk";
import { hydrateApprovals, listApprovals, writeApprovalCritical } from "@/lib/approvals";
import { advanceSpendChain, readSpendChain } from "@/lib/company/spendChain";
import { appendWorkEvent } from "@/lib/company/workEvents";

export const dynamic = "force-dynamic";

const DECISIONS = new Set<ChairmanDecisionChoice>(["approve", "reject", "return", "defer", "renew"]);

/** The Chairman's command board; `?view=desk` returns the decision desk (at most seven cards). */
export async function GET(req?: Request) {
  await hydrateChairmanCommands();
  const view = req ? new URL(req.url).searchParams.get("view") : null;
  if (view === "desk") {
    await hydrateApprovals().catch(() => undefined);
    return NextResponse.json({ ok: true, desk: buildDecisionDesk() }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: true, commands: listChairmanCommands().map((command) => publicCommandStatus(command)) });
}

/** A system key (cron or API) is not the Chairman: decisions need the owner's own session. */
function systemCaller(req: Request) {
  return Boolean(req.headers.get("x-api-key") || req.headers.get("x-agent-bridge-key") || req.headers.get("x-chairman-digest-key") || /^bearer\s/i.test(req.headers.get("authorization") || ""));
}

async function returnSpend(approvalId: string, note: string) {
  await hydrateApprovals();
  const item = listApprovals().find((approval) => approval.id === approvalId);
  if (!item) throw new Error("طلب الصرف غير موجود.");
  const state = readSpendChain(item);
  if (!state) throw new Error("هذا العنصر ليس طلباً مالياً.");
  const next = advanceSpendChain(state, "owner", { action: "return_to_department", note });
  const saved = await writeApprovalCritical({ ...item, metadata: { ...item.metadata, spendChain: next } });
  await appendWorkEvent({ entityType: "spend", entityId: saved.id, actor: "owner", action: "return_to_department", fromState: state.stage, toState: next.stage, note, evidence: null });
  return saved;
}

async function decide(body: Record<string, unknown>) {
  const decision = String(body.decision || "") as ChairmanDecisionChoice;
  if (!DECISIONS.has(decision)) throw new Error("القرار غير معروف (approve أو reject أو return أو defer أو renew).");
  const note = body.note == null ? undefined : String(body.note);
  if (body.approvalId) {
    // Spend approve/reject/defer go through /api/approvals/decisions, which runs the execution path.
    if (decision !== "return") throw new Error("اعتماد الصرف ورفضه وتأجيله من بطاقة الصرف نفسها.");
    if (!note || note.trim().length < 3) throw new Error("الإعادة تحتاج ملاحظة.");
    const saved = await returnSpend(String(body.approvalId), note.trim());
    return { approvalId: saved.id, stage: readSpendChain(saved)?.stage };
  }
  const commandId = String(body.commandId || "");
  if (!commandId) throw new Error("يلزم معرّف الأمر.");
  const command = await decideChairmanCommand(commandId, { decision, note }, "owner");
  return { command: publicCommandStatus(command) };
}

/** POST: issue an order, or `action: "decide"` / `action: "decide-all"` on the decision desk. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "decide" || body.action === "decide-all") {
      if (systemCaller(req)) return NextResponse.json({ ok: false, message: "القرار لرئيس مجلس الإدارة من جلسته فقط." }, { status: 403 });
      await hydrateChairmanCommands();
      if (body.action === "decide") return NextResponse.json({ ok: true, ...(await decide(body)) });
      // Decide-all covers low-risk command cards only. Spend is never batch-approved.
      const choice = body.decision === "reject" ? "reject" : body.decision === "approve" ? "approve" : null;
      if (!choice) return NextResponse.json({ ok: false, message: "القرار الجماعي اعتماد أو رفض فقط." }, { status: 400 });
      const cards = buildDecisionDesk().cards.filter((card) => card.lowRisk && card.commandId && card.kind === "command-decision");
      const decided = [];
      for (const card of cards) decided.push(publicCommandStatus(await decideChairmanCommand(card.commandId!, { decision: choice, note: "قرار جماعي على البنود منخفضة المخاطر" }, "owner")));
      return NextResponse.json({ ok: true, decided });
    }
    const command = String(body.command ?? body.text ?? "").trim();
    if (command.length < 3) return NextResponse.json({ ok: false, message: "الأمر قصير." }, { status: 400 });
    const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority) ? body.priority : "HIGH";
    const assignee = body.assignee == null ? undefined : String(body.assignee);
    const issued = await issueChairmanCommand(command, { priority, assignee });
    return NextResponse.json({ ok: true, command: publicCommandStatus(issued) });
  } catch (error) {
    await logError("CHAIRMAN_COMMAND_FAILED", error);
    const message = error instanceof Error ? error.message : "تعذر تسجيل الأمر.";
    const status = /غير معروف|قصير|يلزم|تحتاج|لا توجد|غير موجود|ليس|فقط|من بطاقة|لم يكتمل/.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
