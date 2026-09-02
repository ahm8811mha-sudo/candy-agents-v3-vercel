import { describe, expect, it } from "vitest";
import {
  describeMigrationChain,
  diffMigrationChain,
  versionFromFilename,
} from "@/lib/release/migrationChain.mjs";

describe("versionFromFilename", () => {
  it("reads the ordered version prefix", () => {
    expect(versionFromFilename("20260721000100_decision_commitments.sql")).toBe("20260721000100");
    expect(versionFromFilename("supabase/migrations/202607130002_cron_run_tracking.sql")).toBe("202607130002");
  });

  it("returns null for a file that carries no version", () => {
    expect(versionFromFilename("README.md")).toBeNull();
    expect(versionFromFilename("no_leading_digits.sql")).toBeNull();
  });
});

describe("diffMigrationChain", () => {
  it("passes only when every repository migration is recorded as applied", () => {
    const diff = diffMigrationChain(["001", "002", "003"], ["001", "002", "003"]);
    expect(diff.applied).toBe(true);
    expect(diff.missing).toEqual([]);
  });

  it("fails and names the migrations the database has never seen", () => {
    const diff = diffMigrationChain(["001", "002", "003"], ["001"]);
    expect(diff.applied).toBe(false);
    expect(diff.missing).toEqual(["002", "003"]);
    expect(describeMigrationChain(diff)).toContain("002, 003");
  });

  it("reports ledger entries missing from the checkout without failing on them", () => {
    const diff = diffMigrationChain(["001"], ["001", "999"]);
    expect(diff.applied).toBe(true);
    expect(diff.unknown).toEqual(["999"]);
  });

  it("never passes when there is nothing to verify", () => {
    const diff = diffMigrationChain([], []);
    expect(diff.applied).toBe(false);
    expect(describeMigrationChain(diff)).toContain("nothing could be verified");
  });

  it("ignores blank ledger rows and duplicate files", () => {
    const diff = diffMigrationChain(["001", "001"], [" 001 ", "", "  "]);
    expect(diff.fileCount).toBe(1);
    expect(diff.appliedCount).toBe(1);
    expect(diff.applied).toBe(true);
  });
});
