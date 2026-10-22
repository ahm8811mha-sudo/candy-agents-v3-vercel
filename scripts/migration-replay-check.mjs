#!/usr/bin/env node
/**
 * Proves the ledger repair (lib/release/migrationReplay.mjs) on a throwaway
 * database, the way production received its migrations: a small chain is
 * applied by hand with no ledger rows, then the repair must record exactly the
 * migrations whose schema is there, name what is missing for the rest, and
 * leave the database as it found it.
 *
 * usage: node scripts/migration-replay-check.mjs --url <postgres-url>   (throwaway db only)
 */

import assert from "node:assert/strict";
import pg from "pg";
import { repairLedgerByReplay } from "../lib/release/migrationReplay.mjs";

const SCHEMAS = ["replay_check"];
const CHAIN = [
  ["19990101000001_items.sql", `
create schema if not exists replay_check;
create table if not exists replay_check.items (id text primary key, name text);
alter table replay_check.items enable row level security;
drop policy if exists items_closed on replay_check.items;
create policy items_closed on replay_check.items for all to public using (false);
create or replace function replay_check.label(p text) returns text language sql as $$ select 'v1:' || p $$;
create index if not exists items_name_idx on replay_check.items (name);`],
  ["19990101000002_price.sql", `
alter table replay_check.items add column if not exists price numeric(12,2) not null default 0;
create or replace function replay_check.label(p text) returns text language sql as $$ select 'v2:' || p $$;
revoke all on function replay_check.label(text) from public;`],
  ["19990101000003_seed.sql", `
insert into replay_check.items (id, name) values ('seed-1', 'first') on conflict (id) do nothing;`],
  ["19990101000004_trigger.sql", `
create or replace function replay_check.named() returns trigger language plpgsql as $$
begin
  new.name := coalesce(new.name, 'unnamed');
  return new;
end;
$$;
drop trigger if exists items_named on replay_check.items;
create trigger items_named before insert on replay_check.items for each row execute function replay_check.named();
drop index if exists replay_check.items_name_idx;`],
  ["19990101000005_a_shared.sql", "create index if not exists items_price_idx on replay_check.items (price);"],
  ["19990101000005_b_shared.sql", "comment on table replay_check.items is 'replay check';"],
].map(([file, sql]) => ({ file, sql }));

const index = process.argv.indexOf("--url");
const url = (index >= 0 ? process.argv[index + 1] : process.env.PGURL || "").trim();
if (!url) throw new Error("--url <postgres-url> (a throwaway database) is required");
// It drops a schema and edits the ledger, so it never runs against a remote database.
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname)) throw new Error("throwaway local databases only; refusing a remote host");

const client = new pg.Client({ connectionString: url });
await client.connect();
const one = async (sql) => (await client.query(sql)).rows[0];

async function applyByHand(files) {
  await client.query("drop schema if exists replay_check cascade");
  await client.query("create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)");
  await client.query("delete from supabase_migrations.schema_migrations where version like '19990101%'");
  for (const { sql } of files) await client.query(sql);
}

async function repair(files) {
  const lines = [];
  const result = await repairLedgerByReplay(client, { files, log: (line) => lines.push(line), schemas: SCHEMAS });
  return { ...result, lines };
}

const scenarios = {
  async "records every migration applied by hand"() {
    await applyByHand(CHAIN);
    const { recorded, unrecorded } = await repair(CHAIN);
    assert.deepEqual(recorded, ["19990101000001", "19990101000002", "19990101000003", "19990101000004", "19990101000005"]);
    assert.deepEqual(unrecorded, []);
    const shared = await one("select name, array_length(statements, 1) as files from supabase_migrations.schema_migrations where version = '19990101000005'");
    assert.deepEqual(shared, { name: "a_shared + b_shared", files: 2 });
    assert.equal((await one("select count(*)::int as n from replay_check.items")).n, 1);
  },

  async "names what is missing, records the rest, and leaves the drift as it found it"() {
    await applyByHand(CHAIN);
    await client.query(`
      alter table replay_check.items drop column price;
      create or replace function replay_check.label(p text) returns text language sql as $$ select 'v1:' || p $$;
      drop policy items_closed on replay_check.items;`);
    const { recorded, unrecorded, lines } = await repair(CHAIN);
    assert.deepEqual(recorded, ["19990101000003", "19990101000004"]);
    assert.deepEqual(unrecorded, ["19990101000001", "19990101000002", "19990101000005"]);
    const said = lines.join("\n");
    assert.match(said, /not recorded: 19990101000001_items\.sql: .*policy replay_check\.items\.items_closed/);
    assert.match(said, /not recorded: 19990101000002_price\.sql: .*column replay_check\.items\.price.*function replay_check\.label\(p text\)/);
    assert.match(said, /not recorded: 19990101000005_a_shared\.sql: .*index replay_check\.items_price_idx/);
    assert.doesNotMatch(said, /items_name_idx/);
    const after = await one(`select
      exists (select 1 from information_schema.columns where table_schema = 'replay_check' and column_name = 'price') as price,
      replay_check.label('x') as label,
      exists (select 1 from pg_policies where schemaname = 'replay_check') as policy`);
    assert.deepEqual(after, { price: false, label: "v1:x", policy: false });
  },

  async "leaves out a migration that cannot run again"() {
    const once = { file: "19990101000006_not_idempotent.sql", sql: "create trigger items_audit after insert on replay_check.items for each row execute function replay_check.named();" };
    await applyByHand([...CHAIN, once]);
    const { recorded, unrecorded, lines } = await repair([...CHAIN, once]);
    assert.equal(recorded.length, 5);
    assert.deepEqual(unrecorded, ["19990101000006"]);
    assert.match(lines.join("\n"), /not recorded: 19990101000006_not_idempotent\.sql: its replay failed: trigger "items_audit" for relation "items" already exists/);
  },

  async "refuses a chain holding transaction control, and runs none of it"() {
    const commits = { file: "19990101000007_commits.sql", sql: "insert into replay_check.items (id) values ('committed');\ncommit;" };
    await applyByHand(CHAIN);
    const { recorded, lines } = await repair([...CHAIN, commits]);
    assert.deepEqual(recorded, []);
    assert.match(lines.join("\n"), /replay refused: 19990101000007_commits\.sql: line 2: top-level commit/);
    assert.equal((await one("select count(*)::int as n from replay_check.items where id = 'committed'")).n, 0);
    assert.equal((await one("select count(*)::int as n from supabase_migrations.schema_migrations where version like '19990101%'")).n, 0);
  },

  async "replays seeded rows without comparing them, and rolls them back"() {
    await applyByHand(CHAIN);
    await client.query("delete from replay_check.items");
    const { recorded, lines } = await repair(CHAIN);
    assert.equal(recorded.length, 5);
    assert.match(lines.join("\n"), /recorded: 19990101000003_seed\.sql, its replay changed no lasting schema; rows its data statements wrote, not compared: replay_check\.items \+1/);
    assert.equal((await one("select count(*)::int as n from replay_check.items")).n, 0);
  },
};

let failed = 0;
try {
  for (const [name, scenario] of Object.entries(scenarios)) {
    try {
      await scenario();
      console.log(`[migration-replay-check] passed: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`[migration-replay-check] FAILED: ${name}: ${error.message}`);
    }
  }
} finally {
  await client.query("drop schema if exists replay_check cascade").catch(() => {});
  await client.query("delete from supabase_migrations.schema_migrations where version like '19990101%'").catch(() => {});
  await client.end();
}
process.exit(failed ? 1 : 0);
