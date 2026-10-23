// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Production's company brain told the owner "0 open decisions" while 30 waited
// in the approval queue (2026-10-23): it counted company_decisions, a log of
// review actions with no status column, and looked for workflow and
// integration statuses those tables never hold.
const tables = vi.hoisted(() => {
  const rows = (tenant: string, column: string, values: string[]) => values.map((value, index) => ({ id: `${column}-${index}-${tenant}`, tenant_id: tenant, [column]: value }));
  const columns: Record<string, string[]> = {
    company_decisions: ["id", "tenant_id", "source_type", "source_id", "title", "action", "note", "forwarded_to", "decided_by", "created_at"],
    company_approvals: ["id", "tenant_id", "status"],
    workflow_instances: ["id", "tenant_id", "status"],
    integration_attempts: ["id", "tenant_id", "status"],
    system_alerts: ["id", "tenant_id", "status", "severity"],
    gov_documents: ["id", "tenant_id"],
    accounting_journal_entries: ["id", "tenant_id", "status"],
  };
  const data: Record<string, Array<Record<string, unknown>>> = {
    company_decisions: rows("golden-star", "action", ["APPROVED", "NOTED", "FORWARDED"]),
    company_approvals: [...rows("golden-star", "status", ["PENDING", "PENDING", "DEFERRED", "APPROVED", "REJECTED"]), ...rows("other", "status", ["PENDING"])],
    workflow_instances: rows("golden-star", "status", ["PENDING", "RUNNING", "WAITING_APPROVAL", "RETRY", "COMPLETED", "FAILED", "CANCELLED"]),
    integration_attempts: rows("golden-star", "status", ["STARTED", "SUCCEEDED", "FAILED", "RETRY", "RETRY", "DEAD_LETTER", "SKIPPED"]),
    system_alerts: [
      { id: "a1", tenant_id: "golden-star", status: "OPEN", severity: "CRITICAL" },
      { id: "a2", tenant_id: "golden-star", status: "OPEN", severity: "WARNING" },
      { id: "a3", tenant_id: "golden-star", status: "ACKNOWLEDGED", severity: "CRITICAL" },
    ],
    gov_documents: rows("golden-star", "document_type", ["CR"]),
    accounting_journal_entries: rows("golden-star", "status", ["POSTED", "POSTED", "DRAFT", "VOID"]),
  };
  return { columns, data };
});

vi.mock("@/lib/supabase", async (importOriginal) => {
  // A head count the way PostgREST answers it: a filter on a column the table
  // lacks is a 400 with no body, so the client's error message is empty.
  const count = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const used: string[] = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { used.push(column); filters.push((row) => row[column] === value); return query; },
      in: (column: string, values: unknown[]) => { used.push(column); filters.push((row) => values.includes(row[column])); return query; },
      then: (resolve: (result: unknown) => void) => {
        const known = tables.columns[table];
        if (!known || used.some((column) => !known.includes(column))) return resolve({ count: null, error: { message: "" }, status: known ? 400 : 404 });
        resolve({ count: (tables.data[table] || []).filter((row) => filters.every((keep) => keep(row))).length, error: null, status: 200 });
      },
    };
    return query;
  };
  return {
    ...(await importOriginal<typeof import("@/lib/supabase")>()),
    getSupabaseAdmin: () => ({ from: count }),
  };
});
import { buildCompanySnapshot } from "@/lib/company-intelligence/engine";

describe("the company brain's snapshot counts", () => {
  it("counts what is waiting, running and failing where each one is recorded", async () => {
    const snapshot = await buildCompanySnapshot("golden-star");
    expect(snapshot.metrics).toEqual({
      openDecisions: 2,
      activeWorkflows: 4,
      failedIntegrations: 4,
      openCriticalAlerts: 1,
      governmentDocuments: 1,
      postedJournalEntries: 2,
    });
  });
});
