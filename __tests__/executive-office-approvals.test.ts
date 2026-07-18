import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/companyExecutionSystem", () => ({
  getDashboardData: vi.fn(),
  runCompanyExecution: vi.fn(),
}));
vi.mock("@/lib/enterpriseSystems", () => ({
  getEnterpriseStatus: vi.fn(),
  runOpportunityRadar: vi.fn(),
  seedEnterpriseOperatingSystem: vi.fn(),
}));
vi.mock("@/lib/governanceOS", () => ({
  logDecision: vi.fn(),
  seedGovernanceOS: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("@/lib/company/audit", () => ({
  toLegacyDecisionAuditRow: vi.fn((row) => row),
}));

import { getDashboardData } from "@/lib/companyExecutionSystem";
import { getEnterpriseStatus } from "@/lib/enterpriseSystems";
import { getExecutiveOffice } from "@/lib/executiveOffice";
import { getSupabaseAdmin } from "@/lib/supabase";

function queryResult(data: unknown[]) {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn(() => ({ data, error: null })),
      })),
    })),
  };
}

describe("executive office decision center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEnterpriseStatus).mockResolvedValue({
      ceoItems: [],
      intelligence: { healthScore: 84, riskLevel: "LOW", actionToday: "راجع التنفيذ" },
    } as Awaited<ReturnType<typeof getEnterpriseStatus>>);
    vi.mocked(getDashboardData).mockResolvedValue({
      projects: [],
      tasks: [],
      decisions: [],
      alerts: [],
      kpis: [],
      actions: [],
      approvals: [{ id: "legacy-hidden", entity_type: "LEGACY", status: "PENDING" }],
      memory: [],
    });
  });

  it("uses company_approvals instead of the legacy approvals table", async () => {
    const rows: Record<string, unknown[]> = {
      company_approvals: [{
        id: "approval-unified",
        type: "T2_EXECUTIVE_ACTION",
        title: "اعتماد مشروع",
        detail: "قرار موحد بانتظار المالك",
        status: "PENDING",
        metadata: { entityId: "project-1" },
      }],
      executive_calendar_events: [],
      executive_meeting_minutes: [],
      executive_daily_briefs: [],
      audit_log: [],
    };
    const from = vi.fn((table: string) => queryResult(rows[table] || []));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseAdmin>);

    const office = await getExecutiveOffice();

    expect(from).toHaveBeenCalledWith("company_approvals");
    expect(office.dashboard.approvals).toEqual([
      expect.objectContaining({
        id: "approval-unified",
        entity_type: "T2_EXECUTIVE_ACTION",
        entity_id: "project-1",
        notes: "قرار موحد بانتظار المالك",
      }),
    ]);
    expect(office.dashboard.approvals).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "legacy-hidden" })]));
    expect(office.operatingBrief.waitingApprovals).toBe(1);
  });
});
