import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("unified execution architecture", () => {
  it("keeps both public execution facades on the canonical repository", () => {
    const companyRunner = source("lib/companyExecutionSystem.ts");
    const approvedIdeaRunner = source("lib/company/ideaExecution.ts");

    expect(companyRunner).toContain("createExecutionBundle(");
    expect(approvedIdeaRunner).toContain("createExecutionBundle(");
    expect(companyRunner).not.toContain('.from("projects").insert');
    expect(approvedIdeaRunner).not.toContain('.from("projects").insert');
  });

  it("keeps the execution RPC service-only and covers every durable artifact", () => {
    const migration = source("supabase/migrations/202607150002_unified_execution_bundle.sql");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.orvanta_create_execution_bundle(jsonb) from public, anon, authenticated");
    for (const table of [
      "workflow_instances",
      "workflow_steps",
      "projects",
      "tasks",
      "business_kpis",
      "business_actions",
      "company_approvals",
      "audit_log",
      "company_events",
      "event_outbox",
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain("public.orvanta_decide_execution_bundle");
    expect(migration).toContain("company.execution.approval_decided");
    expect(migration).toContain("revoke all on function public.orvanta_decide_execution_bundle(text,text,text,text,jsonb) from public, anon, authenticated");
  });

  it("routes execution sign-off through the atomic decision RPC", () => {
    const route = source("app/api/approvals/decisions/route.ts");
    const governed = source("lib/company/governedApprovalExecution.ts");

    expect(route).toContain("decideCompanyExecutionApprovalCritical");
    expect(governed).toContain('supabase.rpc("orvanta_decide_execution_bundle"');
  });

  it("starts specialist execution after approval and returns it to a project workfile", () => {
    const decisionRoute = source("app/api/approvals/decisions/route.ts");
    const actionRoute = source("app/api/company/actions/route.ts");
    const actionPanel = source("components/ActionQueuePanel.tsx");

    expect(decisionRoute).toContain("executeProjectInternalActions");
    expect(actionRoute).toContain('.from("projects")');
    expect(actionRoute).toContain('.from("tasks")');
    expect(actionRoute).toContain('.eq("tenant_id", auth.context.tenantId)');
    expect(actionPanel).toContain('id="approved-projects"');
    expect(actionPanel).toContain("project-agent-results");
  });
});
