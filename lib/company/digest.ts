/**
 * F5 — Daily owner digest (docs/ROADMAP.md).
 *
 * Composes the company's state into a short Arabic brief and dispatches it to
 * the owner over a configured channel (webhook / integration). Composition is
 * pure and testable; dispatch degrades to "recorded" when no channel is set,
 * so the company always produces its brief.
 */

import { listApprovals, approvalStats } from "../approvals";
import { getLearningSnapshot } from "./learning";
import { ideaStats, ensureDailyIdea } from "./ideas";
import { ledgerTotals } from "./ledger";
import { triggerNotification, getEnabledIntegrations } from "../integrations";

export type Digest = {
  date: string;
  headline: string;
  pendingDecisions: number;
  topPending: string[];
  ideasFromTeam: number;
  approvalRate: number;
  revenue: number;
  vatPayable: number;
  text: string;
};

const sar = (n: number) => `${Math.round(n).toLocaleString("ar-SA")} ر.س`;

export function composeDigest(now: Date = new Date()): Digest {
  ensureDailyIdea(now);
  const pending = listApprovals("PENDING");
  const stats = approvalStats();
  const ideas = ideaStats();
  const learning = getLearningSnapshot();
  const ledger = ledgerTotals();

  const topPending = pending.slice(0, 3).map((a) => `• ${a.title}${a.amount ? ` (${sar(a.amount)})` : ""}`);
  const date = now.toISOString().slice(0, 10);

  const headline =
    stats.pending > 0
      ? `لديك ${stats.pending} قرار بانتظار اعتمادك`
      : "لا قرارات معلّقة — الشركة تسير";

  const text = [
    `📊 ملخص شركة النجمة الذهبية · ${date}`,
    "",
    headline + ".",
    ...(topPending.length ? ["", "أهم ما ينتظرك:", ...topPending] : []),
    "",
    `💡 أفكار الفريق: ${ideas.fromTeam} · نسبة الاعتماد: ${Math.round(learning.approvalRate * 100)}% · حد الثقة: ${Math.round(learning.confidenceThreshold * 100)}%`,
    `💰 الإيرادات المسجّلة: ${sar(ledger.revenue)} · ضريبة مستحقة: ${sar(ledger.vatPayable)}`,
    "",
    "افتح مركز القرار لاعتماد ما ينتظرك.",
  ].join("\n");

  return {
    date,
    headline,
    pendingDecisions: stats.pending,
    topPending,
    ideasFromTeam: ideas.fromTeam,
    approvalRate: learning.approvalRate,
    revenue: ledger.revenue,
    vatPayable: ledger.vatPayable,
    text,
  };
}

export type DispatchResult = { sent: boolean; channel: string; reason: string };

/** Send the digest over the best available channel; record if none. */
export async function dispatchDigest(now: Date = new Date()): Promise<{ digest: Digest; dispatch: DispatchResult }> {
  const digest = composeDigest(now);
  const enabled = getEnabledIntegrations();

  const channel =
    enabled.find((i) => i.type === "WHATSAPP")?.type ||
    enabled.find((i) => i.type === "EMAIL")?.type ||
    enabled.find((i) => i.type === "WEBHOOK")?.type;

  if (!channel) {
    return { digest, dispatch: { sent: false, channel: "none", reason: "لا قناة إشعار مُهيّأة — تم تكوين الملخص وتسجيله فقط." } };
  }

  const res = await triggerNotification(channel, digest.text);
  return {
    digest,
    dispatch: {
      sent: res.sent,
      channel: res.channel,
      reason: res.sent ? `أُرسل الملخص عبر ${res.channel}.` : `تعذّر الإرسال عبر ${res.channel} — تم تسجيل الملخص.`,
    },
  };
}
