/**
 * The Chairman's decision desk (G1, G2, G10).
 *
 * One daily digest at a fixed time (20:00 Riyadh), at most seven cards ranked
 * by impact. Each card is one question with Sultan's recommendation, the
 * finance and governance lines, the amount, an in-site evidence link, and
 * what happens if no decision is taken. Nothing here approves anything:
 * spend stays with the Chairman alone and is never auto-approved.
 */
import { getAgent } from "./agents";
import { listApprovals, type ApprovalItem } from "../approvals";
import {
  commandReviewLines,
  commandSla,
  isAwaitingChairmanDecision,
  listChairmanCommands,
  recommendationFor,
  type ChairmanCommand,
} from "./chairmanCommands";
import {
  collapseDuplicates,
  isMonetarySpend,
  isOwnerReadySpend,
  readSpendChain,
  returnHolder,
  returnedExpiresAt,
  returnedToDepartment,
} from "./spendChain";

export const DESK_CARD_LIMIT = 7;
/** 20:00 Asia/Riyadh (UTC+3) = 17:00 UTC. */
export const DIGEST_HOUR_UTC = 17;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type DeskChoice = "approve" | "reject" | "return" | "defer";

export type DeskCard = {
  id: string;
  kind: "command-decision" | "external" | "spend";
  commandId: string | null;
  approvalId: string | null;
  question: string;
  subject: string;
  ownerName: string;
  options: string;
  recommendation: string;
  finance: string;
  governance: string;
  legal: string | null;
  amountSAR: number | null;
  evidencePath: string;
  ifNoDecision: string;
  requestedAt: string;
  remindAt: string;
  expiresAt: string;
  reminderDue: boolean;
  ageHours: number;
  lowRisk: boolean;
  duplicateCount: number;
  actions: DeskChoice[];
};

export type DecisionDesk = {
  generatedAt: string;
  digestAt: string;
  cards: DeskCard[];
  /** Cards beyond the seven: they wait for the next digest and are not lost. */
  waiting: number;
  deferred: Array<{ id: string; subject: string; until: string }>;
  expired: Array<{ id: string; kind: DeskCard["kind"]; subject: string; expiredAt: string }>;
  overdue: Array<{ id: string; subject: string; ownerName: string; dueAt: string; label: string; level: number; escalateTo: string | null }>;
  returned: Array<{ id: string; subject: string; amountSAR: number; holder: string; holderName: string; stoppedBy: string; reason: string; note: string; expiresAt: string; duplicateCount: number }>;
  counts: { cards: number; waiting: number; overdue: number; returned: number; deferred: number; expired: number };
};

function name(id: string) {
  if (id === "owner") return "رئيس مجلس الإدارة";
  return getAgent(id)?.name || id;
}

export function nextDigestAt(now = new Date()): string {
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DIGEST_HOUR_UTC, 0, 0));
  if (at.getTime() <= now.getTime()) at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString();
}

function commandCard(command: ChairmanCommand, now: Date): DeskCard | null {
  if (!isAwaitingChairmanDecision(command, now) || !command.decision) return null;
  const external = command.decision.kind === "external";
  const recommendation = recommendationFor(command);
  const reviews = commandReviewLines(command);
  const requested = Date.parse(command.decision.requestedAt);
  const expires = requested + 7 * DAY;
  return {
    id: `cmd:${command.id}`,
    kind: external ? "external" : "command-decision",
    commandId: command.id,
    approvalId: null,
    question: external
      ? `هل تعتمد الإرسال الخارجي في أمر: «${command.text.slice(0, 120)}»؟`
      : `هل تعتمد توصية سلطان في أمر: «${command.text.slice(0, 120)}»؟`,
    subject: command.text,
    ownerName: name(command.ownerAgentId),
    options: external ? "اعتمد الإرسال، أو ارفضه، أو أعِده بملاحظة، أو أجّله أسبوعاً." : "اعتمد التوصية، أو ارفضها، أو أعِدها بملاحظة، أو أجّلها أسبوعاً.",
    recommendation: recommendation || (external ? "جاهز للإرسال بعد اعتمادك." : "لم تُسجّل توصية مكتوبة."),
    finance: reviews.finance || "لا مبلغ في هذا الأمر.",
    governance: reviews.governance || (external ? "الإرسال الخارجي لا يتم إلا باعتمادك." : "لا ملاحظة حوكمة."),
    legal: reviews.legal,
    amountSAR: null,
    evidencePath: `/commands?id=${encodeURIComponent(command.id)}`,
    ifNoDecision: "لا يُطبّق شيء تلقائياً. تذكير بعد 48 ساعة، وتنتهي البطاقة بعد 7 أيام ويمكن إعادة فتحها.",
    requestedAt: command.decision.requestedAt,
    remindAt: new Date(requested + 2 * DAY).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    reminderDue: now.getTime() > requested + 2 * DAY,
    ageHours: Math.max(0, Math.round((now.getTime() - requested) / HOUR)),
    lowRisk: !external && !command.spendApprovalId,
    duplicateCount: 1,
    actions: ["approve", "reject", "return", "defer"],
  };
}

function spendCard(item: ApprovalItem & { duplicateCount: number; duplicateIds: string[] }, now: Date): DeskCard | null {
  const chain = readSpendChain(item);
  if (!chain || !isOwnerReadySpend(chain)) return null;
  const requestedAt = chain.sultanRecommendation?.at || item.createdAt;
  const requested = Date.parse(requestedAt) || Date.parse(item.createdAt);
  return {
    id: `spend:${item.id}`,
    kind: "spend",
    commandId: typeof item.metadata?.commandId === "string" ? item.metadata.commandId : null,
    approvalId: item.id,
    question: `هل تعتمد صرف ${chain.amountSAR} ر.س على «${(chain.subject || item.title).slice(0, 120)}»؟`,
    subject: chain.subject || item.title,
    ownerName: name(chain.preparingAgentId === "department" ? returnHolder(item) : chain.preparingAgentId),
    options: chain.options || "غير مذكور في المذكرة",
    recommendation: chain.sultanRecommendation ? `${chain.sultanRecommendation.result}: ${chain.sultanRecommendation.note}` : "لم تكتمل",
    finance: chain.financeReview ? `${chain.financeReview.result}: ${chain.financeReview.note}` : "لم تكتمل",
    governance: chain.governanceReview ? `${chain.governanceReview.result}: ${chain.governanceReview.note}` : "لم تكتمل",
    legal: null,
    amountSAR: chain.amountSAR,
    evidencePath: `/inbox?decision=${encodeURIComponent(item.id)}`,
    ifNoDecision: "لا يُعتمد أي صرف تلقائياً أبداً. تذكير بعد 48 ساعة، وتنتهي المذكرة بعد 14 يوماً ويمكن إعادة تقديمها.",
    requestedAt: new Date(requested).toISOString(),
    remindAt: new Date(requested + 2 * DAY).toISOString(),
    expiresAt: new Date(requested + 14 * DAY).toISOString(),
    reminderDue: now.getTime() > requested + 2 * DAY,
    ageHours: Math.max(0, Math.round((now.getTime() - requested) / HOUR)),
    lowRisk: false,
    duplicateCount: item.duplicateCount,
    actions: ["approve", "reject", "return", "defer"],
  };
}

export function buildDecisionDesk(now = new Date()): DecisionDesk {
  const commands = listChairmanCommands();
  const open = listApprovals().filter((item) => (item.status === "PENDING") && isMonetarySpend(item.amount));
  const all: DeskCard[] = [
    ...collapseDuplicates(open).map((item) => spendCard(item, now)).filter((card): card is DeskCard => Boolean(card)),
    ...commands.map((command) => commandCard(command, now)).filter((card): card is DeskCard => Boolean(card)),
  ];
  const live = all.filter((card) => Date.parse(card.expiresAt) > now.getTime());
  const expired = all.filter((card) => Date.parse(card.expiresAt) <= now.getTime())
    .map((card) => ({ id: card.id, kind: card.kind, subject: card.subject, expiredAt: card.expiresAt }));
  // Ranked by impact: money first (largest amount), then the oldest question.
  live.sort((a, b) => (b.amountSAR || 0) - (a.amountSAR || 0) || a.requestedAt.localeCompare(b.requestedAt));
  const cards = live.slice(0, DESK_CARD_LIMIT);

  const deferred = commands.filter((command) => command.status === "AWAITING_CHAIRMAN" && command.decision?.status === "DEFERRED" && command.decision.deferredUntil && Date.parse(command.decision.deferredUntil) > now.getTime())
    .map((command) => ({ id: command.id, subject: command.text, until: command.decision!.deferredUntil! }));

  // Every overdue command shows, whatever changed or not since the last read (G9).
  const overdue = commands.filter((command) => command.status !== "CLOSED" && command.status !== "AWAITING_CHAIRMAN" && Date.parse(command.dueAt) < now.getTime())
    .map((command) => {
      const sla = commandSla(command, now);
      return { id: command.id, subject: command.text, ownerName: name(sla.responsible), dueAt: command.dueAt, label: sla.label, level: sla.level, escalateTo: sla.escalateTo };
    });

  const returned = collapseDuplicates(listApprovals().filter((item) => returnedToDepartment(item))).map((item) => {
    const stop = returnedToDepartment(item)!;
    const holder = returnHolder(item);
    return { id: item.id, subject: item.title, amountSAR: Number(item.amount), holder, holderName: name(holder), stoppedBy: stop.by, reason: stop.reason, note: stop.note, expiresAt: returnedExpiresAt(stop, item), duplicateCount: item.duplicateCount };
  });

  return {
    generatedAt: now.toISOString(),
    digestAt: nextDigestAt(now),
    cards,
    waiting: Math.max(0, live.length - cards.length),
    deferred,
    expired,
    overdue,
    returned,
    counts: { cards: cards.length, waiting: Math.max(0, live.length - cards.length), overdue: overdue.length, returned: returned.length, deferred: deferred.length, expired: expired.length },
  };
}

/** Returned items whose seven days passed; the daily desk cron archives them. */
export function expiredReturns(now = new Date()) {
  return listApprovals().filter((item) => {
    const stop = returnedToDepartment(item);
    return stop ? Date.parse(returnedExpiresAt(stop, item)) <= now.getTime() : false;
  });
}
