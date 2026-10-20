#!/usr/bin/env node
/**
 * Applies the reviewed migrations listed in supabase/release-migrations.json to
 * the production database during the Vercel production build, then proves them
 * with the rollback-only suites against that same database.
 *
 * Why the build: production's database credentials live only in Vercel.
 * Nothing else that runs this repository can reach the database (the GitHub
 * verification secrets are unset, the Supabase connector holds another
 * account). A failed migration or suite fails the build, so code that needs
 * the new schema never goes live without it, and the deployment already
 * serving keeps serving.
 *
 * Only a production build of main runs it. Preview builds use the same
 * database and must never change it.
 *
 * usage: node scripts/release-migrations.mjs --release            (Vercel build)
 *        node scripts/release-migrations.mjs --local --url <url>  (throwaway db)
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { versionFromFilename } from "../lib/release/migrationChain.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const LOCK_KEY = "orvanta-release-migrations";

export function releaseGate(env) {
  if (env.VERCEL !== "1") return { run: false, reason: "not a Vercel build" };
  if (env.VERCEL_ENV !== "production") return { run: false, reason: `a ${env.VERCEL_ENV || "unknown"} build shares the production database and never changes it` };
  if (env.VERCEL_GIT_COMMIT_REF !== "main") return { run: false, reason: `production build of ${env.VERCEL_GIT_COMMIT_REF || "an unknown branch"}, not main` };
  return { run: true, reason: "production build of main" };
}

/**
 * Every configured connection, session ones first. A direct session address
 * can be IPv6-only and unreachable from a build machine; the pooled one then
 * still works, because everything here runs inside single transactions.
 */
export function databaseUrls(env) {
  const candidates = [
    ["session", env.ORVANTA_POSTGRES_URL_NON_POOLING],
    ["session", env.POSTGRES_URL_NON_POOLING],
    ["pooled", env.ORVANTA_POSTGRES_URL],
    ["pooled", env.POSTGRES_URL],
  ];
  const seen = new Set();
  return candidates
    .map(([kind, url]) => ({ kind, url: String(url || "").trim() }))
    .filter(({ url }) => url && !seen.has(url) && seen.add(url));
}

export function databaseUrl(env) {
  return databaseUrls(env)[0]?.url || "";
}

/**
 * Supabase presents a certificate from its own authority, which node-postgres
 * would reject under `sslmode=require` (it means verify-full there). The
 * connection stays encrypted; the authority is not pinned.
 */
export function connectionConfig(url, { local = false } = {}) {
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("supa");
  return {
    connectionString: parsed.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    application_name: "orvanta-release-migrations",
    connectionTimeoutMillis: 20_000,
    statement_timeout: 120_000,
  };
}

/** psql meta-commands (`\set …`) mean nothing to the server. */
export function stripPsqlMeta(sql) {
  return sql.split("\n").filter((line) => !line.trimStart().startsWith("\\")).join("\n");
}

/** The same rule Production Verification enforces before touching production. */
export function assertRollbackOnly(name, sql) {
  const lines = sql.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("--"));
  if (lines.at(-1) !== "rollback;") throw new Error(`${name} does not end with rollback; refusing to run it`);
}

export function loadManifest(text = read("supabase/release-migrations.json")) {
  const manifest = JSON.parse(text);
  const migrations = manifest.migrations.map((file) => {
    const version = versionFromFilename(file);
    if (!version) throw new Error(`${file} has no version prefix`);
    return { file, version, name: file.replace(/^\d+_/, "").replace(/\.sql$/, "") };
  });
  return { migrations, suites: manifest.suites };
}

const POSTURE = `
with objects as (
  select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
), reachable as (
  select o.relname, o.relname like 'gov\\_%' as document
  from objects o
  where (has_table_privilege('anon', o.oid, 'SELECT,INSERT,UPDATE,DELETE')
         or has_table_privilege('authenticated', o.oid, 'SELECT,INSERT,UPDATE,DELETE'))
    and (
      o.relkind not in ('r', 'p')
      or not o.relrowsecurity
      or exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = o.relname
          and p.roles && array['anon', 'authenticated', 'public']::name[]
          and coalesce(p.qual, p.with_check, 'true') <> 'false'
      )
    )
)
select
  (select count(*) from objects where relname like 'gov\\_%' and relkind in ('r', 'p')) as document_tables,
  coalesce((select string_agg(relname, ', ' order by relname) from reachable where document), '') as documents_reachable_by_clients,
  coalesce((select string_agg(relname, ', ' order by relname) from reachable where not document), '') as other_tables_reachable_by_clients,
  case when to_regclass('storage.objects') is null then 0 else (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and roles && array['anon', 'authenticated', 'public']::name[]
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%government-documents%'
  ) end as document_storage_client_policies
`;

async function posture(client, label, log) {
  const { rows: [row] } = await client.query(POSTURE);
  log(`[${label}] gov_ tables: ${row.document_tables}`);
  log(`[${label}] document tables or views a client role can reach: ${row.documents_reachable_by_clients || "none"}`);
  log(`[${label}] client storage policies on government documents: ${row.document_storage_client_policies}`);
  log(`[${label}] other public tables a client role can reach: ${row.other_tables_reachable_by_clients || "none"}`);
  return row;
}

async function documentStructure(client, log) {
  const { rows } = await client.query(`
    select table_name, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as columns
    from information_schema.columns
    where table_schema = 'public' and table_name like 'gov\\_%'
    group by table_name order by table_name`);
  log(`gov_ structure (${rows.length} tables):`);
  for (const row of rows) log(`  ${row.table_name}: ${row.columns}`);
}

export async function applyMigrations(client, migrations, log) {
  const applied = [];
  await client.query("begin");
  try {
    // Two builds racing each other wait here instead of both applying.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [LOCK_KEY]);
    await client.query(`create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
    const { rows } = await client.query(
      "select version from supabase_migrations.schema_migrations where version = any($1::text[])",
      [migrations.map((migration) => migration.version)]
    );
    const done = new Set(rows.map((row) => row.version));
    for (const migration of migrations) {
      if (done.has(migration.version)) {
        log(`already applied: ${migration.file}`);
        continue;
      }
      const sql = read(join("supabase/migrations", migration.file));
      try {
        await client.query(sql);
      } catch (error) {
        throw new Error(`${migration.file} failed: ${error.message}`);
      }
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [migration.version, migration.name, [sql]]
      );
      applied.push(migration.file);
      log(`applied: ${migration.file}`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
  return applied;
}

export async function runSuites(client, suites, log) {
  for (const path of suites) {
    const sql = read(path);
    assertRollbackOnly(path, sql);
    try {
      await client.query(stripPsqlMeta(sql));
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw new Error(`${path} failed: ${error.message}`);
    }
    log(`passed: ${path}`);
  }
}

/** What a throwaway database needs before the release chain applies. */
async function prepareLocal(client, log) {
  await client.query(read("supabase/tests/local/bootstrap.sql"));
  const redesign = read("supabase/migrations/20260907122056_idea_foundation_redesign.sql");
  const start = redesign.indexOf("create or replace function public.orvanta_update_task_status(");
  const end = redesign.indexOf("end $$;", start);
  if (start < 0 || end < 0) throw new Error("could not find orvanta_update_task_status in 20260907122056");
  await client.query(redesign.slice(start, end + "end $$;".length));
  await client.query(read("supabase/migrations/20260719000100_task_execution_proof_gate.sql"));
  log("local database prepared: bootstrap, the 8-argument confirmation, the real-world guard");
}

async function main() {
  const args = process.argv.slice(2);
  const log = (line) => console.log(`[release-migrations] ${line}`);
  const local = args.includes("--local");
  let candidates;

  if (local) {
    const index = args.indexOf("--url");
    const url = (index >= 0 ? args[index + 1] : process.env.PGURL || "").trim();
    if (!url) throw new Error("--local needs --url <postgres-url> or PGURL");
    candidates = [{ kind: "local", url }];
  } else if (args.includes("--release")) {
    const gate = releaseGate(process.env);
    if (!gate.run) {
      log(`skipped: ${gate.reason}`);
      return;
    }
    candidates = databaseUrls(process.env);
    if (!candidates.length) throw new Error("production build of main without a database URL; refusing to ship code whose schema cannot be applied");
  } else {
    throw new Error("usage: --release | --local --url <postgres-url>");
  }

  const { migrations, suites } = loadManifest();
  let client;
  for (const candidate of candidates) {
    const attempt = new pg.Client(connectionConfig(candidate.url, { local }));
    try {
      await attempt.connect();
      client = attempt;
      log(`connected (${candidate.kind})`);
      break;
    } catch (error) {
      // The address never reaches the log; the reason does.
      log(`${candidate.kind} connection failed: ${error.code || error.message}`);
      await attempt.end().catch(() => {});
    }
  }
  if (!client) throw new Error("no configured database connection could be opened");
  try {
    if (local) await prepareLocal(client, log);
    await posture(client, "before", log);
    const applied = await applyMigrations(client, migrations, log);
    log(applied.length ? `${applied.length} migration(s) applied` : "nothing to apply");
    await runSuites(client, suites, log);
    await posture(client, "after", log);
    await documentStructure(client, log);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[release-migrations] FAILED: ${error.message}`);
    process.exit(1);
  });
}
