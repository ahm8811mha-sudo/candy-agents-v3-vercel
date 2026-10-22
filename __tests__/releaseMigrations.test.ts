import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script without type declarations
import { RELEASE_VERIFICATION, assertRollbackOnly, connectionConfig, databaseUrl, databaseUrls, loadManifest, releaseGate, stripPsqlMeta, verifyReleaseGates } from "../scripts/release-migrations.mjs";

describe("release migrations gate", () => {
  // Preview builds read the same database as production; only a production
  // build of main may change it.
  it("runs only for a Vercel production build of main", () => {
    expect(releaseGate({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }).run).toBe(true);
    expect(releaseGate({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }).run).toBe(false);
    expect(releaseGate({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "claude/some-branch" }).run).toBe(false);
    expect(releaseGate({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }).run).toBe(false);
    expect(releaseGate({}).run).toBe(false);
  });

  it("tries session connections first, then pooled ones, each once", () => {
    expect(databaseUrls({ ORVANTA_POSTGRES_URL: "pooled", ORVANTA_POSTGRES_URL_NON_POOLING: "session", POSTGRES_URL: "pooled" }))
      .toEqual([{ kind: "session", url: "session" }, { kind: "pooled", url: "pooled" }]);
    expect(databaseUrl({ ORVANTA_POSTGRES_URL: "pooled" })).toBe("pooled");
    expect(databaseUrls({})).toEqual([]);
  });

  it("keeps the connection encrypted without the sslmode node-postgres reads as verify-full", () => {
    const config = connectionConfig("postgres://u:p@host.example:5432/postgres?sslmode=require&supa=base-pooler.x");
    expect(config.connectionString).toBe("postgres://u:p@host.example:5432/postgres");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(connectionConfig("postgresql://postgres@localhost:54329/postgres", { local: true }).ssl).toBe(false);
  });

  it("drops psql meta-commands and refuses a suite that does not roll back", () => {
    expect(stripPsqlMeta("\\set ON_ERROR_STOP on\nbegin;\nselect 1;\nrollback;")).toBe("begin;\nselect 1;\nrollback;");
    expect(() => assertRollbackOnly("ok.sql", "begin;\nselect 1;\nrollback;\n-- done\n")).not.toThrow();
    expect(() => assertRollbackOnly("bad.sql", "begin;\ninsert into t values (1);\ncommit;")).toThrow(/rollback/);
  });
});

describe("release manifest", () => {
  const { migrations, suites } = loadManifest();

  it("names files that exist, in version order, and suites that only roll back", () => {
    for (const migration of migrations) expect(existsSync(`supabase/migrations/${migration.file}`)).toBe(true);
    const versions = migrations.map((migration: { version: string }) => migration.version);
    expect([...versions].sort()).toEqual(versions);
    for (const suite of suites) expect(() => assertRollbackOnly(suite, readFileSync(suite, "utf8"))).not.toThrow();
  });

  it("holds no transaction control the runner's own transaction would break", () => {
    for (const migration of migrations) {
      const sql = readFileSync(`supabase/migrations/${migration.file}`, "utf8");
      expect(sql).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
    }
  });

  // 20261018000300 refuses to replace the confirmation function unless the
  // database holds exactly the body 20260907122056 created.
  it("fingerprints the confirmation function the older migration defines", () => {
    const old = readFileSync("supabase/migrations/20260907122056_idea_foundation_redesign.sql", "utf8");
    const start = old.indexOf("create or replace function public.orvanta_update_task_status(");
    const open = old.indexOf("as $$", start) + "as $$".length;
    const body = old.slice(open, old.indexOf("$$;", open));
    const fingerprint = createHash("md5").update(body).digest("hex");
    expect(readFileSync("supabase/migrations/20261018000300_task_status_with_proof.sql", "utf8")).toContain(`'${fingerprint}'`);
  });
});

// Every production build proves the release gates against the database it can
// reach, and records evidence only for the check that actually passed.
describe("release verification", () => {
  const sql: Record<string, string> = {
    "pass.sql": "begin;\nselect 'pass';\nrollback;",
    "fail.sql": "begin;\nselect 'fail';\nrollback;",
    "commits.sql": "begin;\ninsert into t values (1);\ncommit;",
  };
  const client = (ledger: string[] | Error = []) => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    return {
      queries,
      evidence: () => queries.filter((query) => query.text.includes("insert into public.readiness_evidence")),
      async query(text: string, values?: unknown[]) {
        queries.push({ text, values });
        if (text.includes("'fail'")) throw new Error("tenant boundary breached");
        if (text.includes("supabase_migrations.schema_migrations")) {
          if (ledger instanceof Error) throw ledger;
          return { rows: ledger.map((version) => ({ version })) };
        }
        return { rows: [] };
      },
    };
  };
  const now = new Date("2026-10-22T12:00:00Z");
  const run = (db: ReturnType<typeof client>, checks: Array<{ key: string; suite: string }>, fileVersions = ["1", "2"]) =>
    verifyReleaseGates(db, { commit: "abc123", log: () => {}, now, checks, fileVersions, readSuite: (path: string) => sql[path] });

  it("records production evidence for a suite that passed, expiring like the weekly run", async () => {
    const db = client(["1", "2"]);
    const results = await run(db, [{ key: "rls-regression", suite: "pass.sql" }]);
    expect(results).toEqual([{ key: "rls-regression", passed: true }, { key: "migration-chain-applied", passed: true }]);
    const [row] = db.evidence();
    expect(row.values?.slice(0, 2)).toEqual(["rls-regression", "abc123"]);
    expect(row.values?.[2]).toMatchObject({ verifiedAgainst: "production", source: "production-build", commit: "abc123" });
    expect(row.values?.[3]).toBe("2026-10-22T12:00:00.000Z");
    expect(row.values?.[4]).toBe("2026-11-05T12:00:00.000Z");
    expect(row.text).toMatch(/'production', 'PASS'/);
  });

  it("records nothing for a suite that failed, rolls it back, and lets the build go on", async () => {
    const db = client(["1", "2"]);
    const results = await run(db, [{ key: "rls-regression", suite: "fail.sql" }, { key: "accounting-controls-smoke", suite: "pass.sql" }]);
    expect(results.slice(0, 2)).toEqual([{ key: "rls-regression", passed: false }, { key: "accounting-controls-smoke", passed: true }]);
    expect(db.evidence().map((row) => row.values?.[0])).toEqual(["accounting-controls-smoke", "migration-chain-applied"]);
    expect(db.queries.map((query) => query.text)).toContain("rollback");
  });

  it("refuses a suite that does not end in a rollback, before it reaches the database", async () => {
    const db = client(["1", "2"]);
    const results = await run(db, [{ key: "execution-transaction-smoke", suite: "commits.sql" }]);
    expect(results[0]).toEqual({ key: "execution-transaction-smoke", passed: false });
    expect(db.queries.some((query) => query.text.includes("insert into t"))).toBe(false);
  });

  it("bounds every suite with a statement timeout and clears it afterwards", async () => {
    const db = client(["1", "2"]);
    await run(db, [{ key: "rls-regression", suite: "pass.sql" }]);
    const texts = db.queries.map((query) => query.text);
    expect(texts.indexOf("set statement_timeout = '120s'")).toBeLessThan(texts.findIndex((text) => text.includes("'pass'")));
    expect(texts).toContain("reset statement_timeout");
  });

  it("proves the migration chain only when every repository migration is in the ledger", async () => {
    const partial = client(["1"]);
    expect((await run(partial, [], ["1", "2"]))).toEqual([{ key: "migration-chain-applied", passed: false }]);
    expect(partial.evidence()).toHaveLength(0);
    const noLedger = client(new Error('relation "supabase_migrations.schema_migrations" does not exist'));
    expect((await run(noLedger, [], ["1", "2"]))).toEqual([{ key: "migration-chain-applied", passed: false }]);
    expect(noLedger.evidence()).toHaveLength(0);
  });

  it("verifies the same suites the weekly Production Verification workflow records", () => {
    expect(RELEASE_VERIFICATION).toEqual([
      { key: "rls-regression", suite: "supabase/tests/rls_regression.sql" },
      { key: "execution-transaction-smoke", suite: "supabase/tests/execution_bundle.sql" },
      { key: "accounting-controls-smoke", suite: "supabase/tests/accounting_controls_regression.sql" },
    ]);
    for (const { suite } of RELEASE_VERIFICATION) expect(() => assertRollbackOnly(suite, readFileSync(suite, "utf8"))).not.toThrow();
  });
});
