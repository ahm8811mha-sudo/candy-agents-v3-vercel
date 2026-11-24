import { describe, expect, it } from "vitest";
import { blankSpendChain } from "./spendChain";
import { crHold, mentionsCrSuspension, radarProjectId, radarProjectStatus, radarSpendGuard, RADAR_REJECTION_COOLDOWN_DAYS } from "./radarGuard";

const now = new Date("2026-11-25T05:00:00Z");
const idea = "تحقق عضوي من الطلب قبل أي توسع مدفوع";
const radar = (over: Record<string, unknown> = {}) => ({
  id: "apr-r1", title: `تجربة رادار الفرص: ${idea}`, amount: 5000, status: "REJECTED",
  createdAt: "2026-10-27T05:55:00Z", decidedAt: "2026-11-24T11:00:00Z", decidedBy: "رئيس مجلس الإدارة",
  note: "قرار رئيس مجلس الإدارة: الرفض. لا سيولة.",
  metadata: { source: "governanceOS", actionKind: "OPPORTUNITY_RADAR_PILOT", entityType: "opportunity_radar_runs", entityId: "run-1", opportunity: { title: idea } },
  ...over,
});

describe("radar spend guard", () => {
  it("recognises a CR-suspension statement in Arabic and English", () => {
    expect(mentionsCrSuspension("لا صرف قبل رفع تعليق السجل")).toBe(true);
    expect(mentionsCrSuspension("السجل التجاري معلّق حالياً")).toBe(true);
    expect(mentionsCrSuspension("no liquidity and the CR is suspended")).toBe(true);
    expect(mentionsCrSuspension("لا سيولة الآن")).toBe(false);
  });

  it("raises nothing paid while the CR is suspended, even with new evidence", () => {
    const rejected = radar({ note: "الرفض: لا سيولة والسجل التجاري موقوف" });
    const guard = radarSpendGuard({ approvals: [rejected], idea: "فكرة أخرى تماماً", amountSAR: 5000, evidence: "x".repeat(80), now });
    expect(guard).toMatchObject({ allowed: false, code: "CR_SUSPENDED", basedOn: "apr-r1" });
  });

  it("an ACTIVE CR document newer than the statement lifts the hold", () => {
    const rejected = radar({ note: "السجل التجاري موقوف" });
    expect(crHold([rejected], [{ status: "ACTIVE", updated_at: "2026-11-30T00:00:00Z" }], now)).toBeNull();
    expect(crHold([rejected], [{ status: "ACTIVE", updated_at: "2026-11-01T00:00:00Z" }], now)).not.toBeNull();
    expect(crHold([], [{ status: "SUSPENDED", updated_at: "2026-11-01T00:00:00Z" }], now)).toMatchObject({ basedOn: "gov_documents" });
  });

  it("respects a rejection of the same idea for the cooldown, unless new evidence comes", () => {
    const guard = radarSpendGuard({ approvals: [radar()], idea, amountSAR: 5000, now });
    expect(guard).toMatchObject({ allowed: false, code: "COOLDOWN", basedOn: "apr-r1" });
    expect(radarSpendGuard({ approvals: [radar()], idea, amountSAR: 5000, now, evidence: "قائمة اهتمام 140 عميلاً و38 طلباً مسبقاً خلال أسبوعين" }).allowed).toBe(true);
    const later = new Date(Date.parse("2026-11-24T11:00:00Z") + (RADAR_REJECTION_COOLDOWN_DAYS + 1) * 86_400_000);
    expect(radarSpendGuard({ approvals: [radar()], idea, amountSAR: 5000, now: later }).allowed).toBe(true);
    expect(radarSpendGuard({ approvals: [radar()], idea: "باقة خدمات مختلفة", amountSAR: 5000, now }).allowed).toBe(true);
  });

  it("never raises a second request while one for the same idea is open; 0 SAR is never held", () => {
    expect(radarSpendGuard({ approvals: [radar({ status: "PENDING", decidedAt: undefined })], idea, amountSAR: 5000, now })).toMatchObject({ code: "PENDING_SAME_IDEA" });
    expect(radarSpendGuard({ approvals: [radar({ note: "السجل موقوف" })], idea, amountSAR: 0, now }).allowed).toBe(true);
  });

  it("gives each radar run one stable project id and a status that mirrors the decision", () => {
    expect(radarProjectId("run-1")).toBe(radarProjectId("run-1"));
    expect(radarProjectId("run-1")).not.toBe(radarProjectId("run-2"));
    expect(radarProjectId("run-1")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(radarProjectStatus("REJECTED")).toEqual({ status: "REJECTED", approval_status: "REJECTED" });
    expect(radarProjectStatus("PENDING")).toEqual({ status: "PROPOSED", approval_status: "PENDING" });
  });
});

describe("radar project title", () => {
  it("uses the Arabic chain subject, not the English radar title", async () => {
    const { radarProjectTitle } = await import("./radarProject");
    const item = { title: "Opportunity radar pilot: Organic demand validation sprint", amount: 5000, metadata: { spendChain: blankSpendChain({ amountSAR: 5000, subject: "تجربة رادار الفرص: تحقق عضوي من الطلب" }) } };
    expect(radarProjectTitle(item)).toBe("تحقق عضوي من الطلب");
    expect(radarProjectTitle({ title: "تجربة رادار الفرص: فكرة", metadata: {} })).toBe("فكرة");
  });
});
