import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OwnerAbsencePanel from "./OwnerAbsencePanel";

const activePolicy = {
  id: "policy-1",
  status: "ACTIVE",
  effectiveStatus: "ACTIVE",
  startsAt: "2026-07-16T08:00:00.000Z",
  endsAt: "2026-07-30T08:00:00.000Z",
  strategicGuidance: "استمر في التشغيل القائم ولا تغيّر الاستراتيجية دون قرار المالك.",
  prohibitedActions: ["STRATEGY_CHANGE", "LEGAL_COMMITMENT"],
  routineAutoLimitSAR: 5_000,
  executiveAgentLimitSAR: 25_000,
  maxAutonomousRisk: "MEDIUM",
  allowExternalActions: false,
  requireCompletionEvidence: true,
  delegatedHumanName: "مسؤول الطوارئ",
  delegatedHumanContact: "operations@example.com",
  dailyBriefHour: 18,
  lastRunAt: "2026-07-16T15:00:00.000Z",
  policyVersion: "2026-07-owner-continuity-v1",
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OwnerAbsencePanel", () => {
  it("shows the owner charter and pauses autonomous execution through the owner API", async () => {
    const pausedPolicy = { ...activePolicy, status: "PAUSED", effectiveStatus: "PAUSED" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        policy: activePolicy,
        canManage: true,
        events: [{
          id: "event-1",
          event_type: "OWNER_ABSENCE_SWEEP_COMPLETED",
          decision: "OPERATIONS_CONTINUING",
          reason: "Autonomous operations remained inside the owner charter.",
          created_at: "2026-07-16T15:00:00.000Z",
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, policy: pausedPolicy }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, policy: pausedPolicy, canManage: true, events: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<OwnerAbsencePanel />);

    expect(await screen.findByRole("heading", { name: "طبقة غياب المالك" })).toBeTruthy();
    expect(screen.getByText("استمرارية الغياب فعّالة")).toBeTruthy();
    expect(screen.getByText("تنفيذ داخلي روتيني")).toBeTruthy();
    expect(screen.getByText("استراتيجية أو مخاطرة عالية")).toBeTruthy();
    expect(screen.getByText("جولة استمرارية مكتملة")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /إيقاف مؤقت/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(request.method).toBe("PUT");
    expect(payload.status).toBe("PAUSED");
    expect(payload.strategicGuidance).toContain("لا تغيّر الاستراتيجية");
  });
});
