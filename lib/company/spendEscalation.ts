/**
 * Stuck spend requests escalate themselves.
 *
 * Incident (27 Oct - 24 Nov 2026): a 5,000 SAR opportunity-radar request sat at
 * "waiting for the department memo" for 28 days. Nobody was named as holder
 * ("القسم المعني"), so no employee's queue showed it and nothing moved.
 *
 * Every request idle in a reviewer's stage past SPEND_STAGE_SLA_HOURS gets, at
 * most once a day: a bridge note to the employee holding it, a note to Sultan
 * (per circular 001, escalations go to the CEO, not the Chairman), and from the
 * second escalation on, a note to Rayyan's follow-up office. The escalation is
 * recorded on the request. Nothing is approved, sent outside, or spent.
 */
import { listApprovals, writeApprovalCritical } from "../approvals";
import { postBridgeMessage } from "./agentBridge";
import { personName } from "./counterItems";
import { readSpendChain, spendEscalationDue } from "./spendChain";
import { appendWorkEvent } from "./workEvents";

const STAGE_TASK: Record<string, string> = {
  department: "مذكرة القسم (الموضوع، البدائل، العائد، المخاطر) عبر submit_department",
  finance: "المراجعة المالية عبر finance_review",
  governance: "فحص الحوكمة عبر governance_review",
  sultan: "توصية الرئيس التنفيذي عبر sultan_recommendation",
};

export async function escalateStuckSpend(now = new Date()) {
  const escalated: Array<{ id: string; holder: string; hours: number; count: number }> = [];
  for (const item of listApprovals()) {
    const due = spendEscalationDue(item, now);
    if (!due) continue;
    const chain = readSpendChain(item);
    if (!chain) continue;
    const count = due.escalations + 1;
    const task = STAGE_TASK[chain.stage] || "الخطوة التالية في السلسلة";
    const text = `تصعيد تلقائي (${count}): طلب الصرف «${chain.subject || item.title}» (${item.id}، ${Number(item.amount)} ر.س) متوقف عند ${personName(due.holder)} منذ ${due.hours} ساعة، والمهلة 48 ساعة. المطلوب: ${task}.`;
    const recipients = [due.holder, ...(due.holder === "sultan" ? [] : ["sultan"]), ...(count >= 2 ? ["diwan"] : [])];
    for (const agentId of [...new Set(recipients)]) {
      try {
        await postBridgeMessage(agentId, { direction: "note", body: text, author: "system" });
      } catch {
        // A missing messages table must not stop the escalation record itself.
      }
    }
    await writeApprovalCritical({ ...item, metadata: { ...item.metadata, spendChain: { ...chain, escalation: { at: now.toISOString(), count, holder: due.holder } } } });
    await appendWorkEvent({ entityType: "spend", entityId: item.id, actor: "system", action: "escalate", fromState: chain.stage, toState: chain.stage, note: text.slice(0, 600), evidence: null });
    escalated.push({ id: item.id, holder: due.holder, hours: due.hours, count });
  }
  return escalated;
}
