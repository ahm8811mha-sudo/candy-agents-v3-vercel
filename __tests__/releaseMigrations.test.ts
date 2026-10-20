import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script without type declarations
import { assertRollbackOnly, connectionConfig, databaseUrl, databaseUrls, loadManifest, releaseGate, stripPsqlMeta } from "../scripts/release-migrations.mjs";

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
