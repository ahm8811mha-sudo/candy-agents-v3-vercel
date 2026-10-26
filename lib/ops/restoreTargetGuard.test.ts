import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { APPROVED_RESTORE_PROJECT_REF, assertRestoreTargetIsolated, RestoreTargetRejected } from "./restoreTargetGuard";

const PRODUCTION_REF = "abcdefghij0123456789";
const PASSWORD = "super-secret-db-password";

function productionUrl(host = `db.${PRODUCTION_REF}.supabase.co`, user = "postgres") {
  return `postgresql://${user}:${PASSWORD}@${host}:5432/postgres`;
}

function restoreUrl(host = `db.${APPROVED_RESTORE_PROJECT_REF}.supabase.co`, user = "postgres") {
  return `postgresql://${user}:${PASSWORD}@${host}:5432/postgres`;
}

describe("restore target guard", () => {
  it("allows the approved isolated project on a different host", () => {
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(),
        restoreUrl: restoreUrl(),
        restoreTargetInput: APPROVED_RESTORE_PROJECT_REF,
      })
    ).not.toThrow();
  });

  it("aborts when the hosts are equal and does not echo the secret", () => {
    const host = `db.${PRODUCTION_REF}.supabase.co`;
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(host),
        restoreUrl: `postgresql://postgres.${APPROVED_RESTORE_PROJECT_REF}:${PASSWORD}@${host}:6543/postgres`,
      })
    ).toThrow(RestoreTargetRejected);
    try {
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(host),
        restoreUrl: `postgresql://postgres.${APPROVED_RESTORE_PROJECT_REF}:${PASSWORD}@${host}:6543/postgres`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toMatch(/host equals/);
      expect(message).not.toContain(PASSWORD);
      expect(message).not.toContain("postgresql://");
    }
  });

  it("aborts when the restore URL contains the production ref on another host", () => {
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(`aws-0-eu-central-1.pooler.supabase.com`, `postgres.${PRODUCTION_REF}`),
        restoreUrl: restoreUrl(`aws-1-eu-west-1.pooler.supabase.com`, `postgres.${PRODUCTION_REF}`),
      })
    ).toThrow(/contains the production project ref/);
  });

  it("aborts when the restore host itself contains the production ref", () => {
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(`aws-0-eu-central-1.pooler.supabase.com`, `postgres.${PRODUCTION_REF}`),
        restoreUrl: productionUrl(),
      })
    ).toThrow(/host contains the production project ref/);
  });

  it("aborts when a Supabase production URL has no identifiable project ref", () => {
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl("aws-0-eu-central-1.pooler.supabase.com", "postgres"),
        restoreUrl: restoreUrl(),
      })
    ).toThrow(/could not be identified/);
  });

  it("aborts unless the restore URL is the approved isolated project", () => {
    const other = "zzzzisolatedprojec99";
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(),
        restoreUrl: restoreUrl(`db.${other}.supabase.co`),
      })
    ).toThrow(/approved isolated restore project/);
  });

  it("aborts when restore_target names production or a different project", () => {
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(),
        restoreUrl: restoreUrl(),
        restoreTargetInput: PRODUCTION_REF,
      })
    ).toThrow(/restore_target is the production project ref/);
    expect(() =>
      assertRestoreTargetIsolated({
        productionUrl: productionUrl(),
        restoreUrl: restoreUrl(),
        restoreTargetInput: "some-other-branch",
      })
    ).toThrow(/restore_target is not the approved/);
  });

  it("the command aborts a matching host and does not print the URL", () => {
    const host = `db.${PRODUCTION_REF}.supabase.co`;
    const env = {
      ...process.env,
      PRODUCTION_DB_URL: productionUrl(host),
      RESTORE_DB_URL: `postgresql://postgres.${APPROVED_RESTORE_PROJECT_REF}:${PASSWORD}@${host}:5432/postgres`,
      RESTORE_TARGET: APPROVED_RESTORE_PROJECT_REF,
    };
    let stderr = "";
    let status = 0;
    try {
      execFileSync("node", ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "lib/ops/restoreTargetGuard.ts"], {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const failed = error as { status?: number; stderr?: string; stdout?: string };
      status = failed.status ?? 0;
      stderr = `${failed.stderr || ""}${failed.stdout || ""}`;
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/host equals/);
    expect(stderr).not.toContain(PASSWORD);
    expect(stderr).not.toContain(host);
    expect(stderr).not.toContain("postgresql://");
  });

  it("rejects an unparseable URL without echoing it", () => {
    try {
      assertRestoreTargetIsolated({
        productionUrl: `not a url ${PASSWORD}`,
        restoreUrl: restoreUrl(),
      });
      throw new Error("expected rejection");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toMatch(/PRODUCTION_DB_URL could not be parsed/);
      expect(message).not.toContain(PASSWORD);
    }
  });
});
