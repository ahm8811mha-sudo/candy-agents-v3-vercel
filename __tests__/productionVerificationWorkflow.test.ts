import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The workflow is YAML and the repository has no YAML parser dependency, so
// these are text checks on the lines that carry the behaviour.
const wf = readFileSync(".github/workflows/production-verification.yml", "utf8");
const snapshot = readFileSync("scripts/sql/gov-structure-snapshot.sql", "utf8");

describe("production verification workflow", () => {
  // Incident: the 2026-10-12 run skipped every step for lack of secrets and
  // still reported success.
  it("warns and says nothing was verified when its secrets are missing", () => {
    expect(wf).toMatch(/::warning::/);
    expect(wf).toMatch(/Nothing was verified[^\n]*>> "\$GITHUB_STEP_SUMMARY"/);
  });

  it("writes the gov_ structure snapshot to the run summary, read-only", () => {
    expect(wf).toContain("scripts/sql/gov-structure-snapshot.sql");
    expect(snapshot).toMatch(/^begin transaction read only;/m);
    expect(snapshot.trim()).toMatch(/rollback;$/);
    expect(snapshot).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
  });

  // Run summaries of a public repository are public: structure may be
  // printed, security findings may not.
  it("never prints policies or grants", () => {
    expect(snapshot).not.toMatch(/pg_policies|role_table_grants|relrowsecurity/);
  });
});
