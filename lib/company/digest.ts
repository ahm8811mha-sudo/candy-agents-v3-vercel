import { listApprovals, approvalStats } from "../approvals";
import { calculateFinancials } from "../accountingSystem";
import { getVatSummary } from "../accountingControls";
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
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

function composeDigestValues(now: Date, revenue: number, vatPayable: number): Digest {
  ensureDailyIdea(now);
  const pending = listApprovals("PENDING");
  const stats = approvalStats();
  const ideas = ideaStats();
  const learning = getLearningSnapshot();
  const topPending = pending.slice(0, 3).map((approval) => `• ${approval.title}${approval.amount ? ` (${sar(approval.amount)})` : ""}`);
  const date = now.toISOString().slice(0, 10);
  const headline = stats.pending > 0
    ? `لديك ${stats.pending} قرار بانتظار اعتمادك`
    : "لا قرارات معلّقة — الشركة تسير";

  const text = [
    `📊 ملخص Orvanta · ${date}`,
    "",
    `${headline}.`,
    ...(topPending.length ? ["", "أهم ما ينتظرك:", ...topPending] : []),
    "",
    `💡 أفكار الفريق: ${ideas.fromTeam} · نسبة الاعتماد: ${Math.round(learning.approvalRate * 100)}% · حد الثقة: ${Math.round(learning.confidenceThreshold * 100)}%`,
    `💰 الإيرادات المرحلة: ${sar(revenue)} · صافي ضريبة القيمة المضافة: ${sar(vatPayable)}`,
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
    revenue,
    vatPayable,
    text,
  };
}

/** Compatibility-only pure digest used by unit tests and offline development. */
export function composeDigest(now: Date = new Date()): Digest {
  const legacy = ledgerTotals();
  return composeDigestValues(now, legacy.revenue, legacy.vatPayable);
}

async function composeOfficialDigest(now: Date) {
  const [financials, vatRows] = await Promise.all([
    calculateFinancials(),
    getVatSummary().catch(() => []),
  ]);
  const currentMonth = now.toISOString().slice(0, 7);
  const vatRow = vatRows.find((row) => String(row.period_month || "").startsWith(currentMonth));
  return composeDigestValues(now, financials.income, Number(vatRow?.net_vat || 0));
}

export type DispatchResult = {
  sent: boolean;
  channel: string;
  reason: string;
  externalId?: string;
  recorded: boolean;
};

async function recordDigest(digest: Digest, dispatch: Omit<DispatchResult, "recorded">) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from("activity_logs").insert({
    id: `digest-${digest.date}-${Date.now()}`,
    tenant_id: getTenantId(),
    actor_id: "system",
    action: "DAILY_DIGEST_COMPOSED",
    entity_type: "daily_digest",
    entity_id: digest.date,
    metadata: {
      sent: dispatch.sent,
      channel: dispatch.channel,
      reason: dispatch.reason,
      externalId: dispatch.externalId || null,
      pendingDecisions: digest.pendingDecisions,
      revenue: digest.revenue,
      vatPayable: digest.vatPayable,
    },
  });
  if (error) throw error;
  return true;
}

/** Compose from the official journal, persist evidence, then deliver through a real configured channel. */
export async function dispatchDigest(now: Date = new Date()): Promise<{ digest: Digest; dispatch: DispatchResult }> {
  const digest = await composeOfficialDigest(now);
  const enabled = getEnabledIntegrations();
  const channel =
    enabled.find((integration) => integration.type === "EMAIL")?.type ||
    enabled.find((integration) => integration.type === "WEBHOOK")?.type;

  let result: Omit<DispatchResult, "recorded">;
  if (!channel) {
    result = {
      sent: false,
      channel: "none",
      reason: "لا توجد قناة إرسال فعلية مهيأة؛ تم إنشاء الملخص وحفظ سجل واضح بعدم التسليم.",
    };
  } else {
    const delivery = await triggerNotification(
      channel,
      digest.text,
      channel === "EMAIL" ? process.env.ORVANTA_OWNER_EMAIL : undefined
    );
    result = {
      sent: delivery.sent,
      channel: delivery.channel,
      externalId: delivery.externalId,
      reason: delivery.sent
        ? `أُرسل الملخص فعليًا عبر ${delivery.channel}.`
        : `لم يُسلّم الملخص عبر ${delivery.channel}; تم تسجيل الفشل.` ,
    };
  }

  const recorded = await recordDigest(digest, result);
  return { digest, dispatch: { ...result, recorded } };
}
