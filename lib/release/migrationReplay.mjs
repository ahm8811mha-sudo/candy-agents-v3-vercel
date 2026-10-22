/**
 * Whether a migration is in a database, read off the database itself.
 *
 * Production received most of its migrations by hand, so its ledger
 * (supabase_migrations.schema_migrations) names only the few the release build
 * applied. The documented remedy, `supabase migration repair`, records a
 * migration as applied on someone's word. This is that repair with the word
 * replaced by a check: the whole chain is run again, in order, inside one
 * transaction that is always rolled back, and the schema is read after every
 * file. A migration whose replay changes nothing that lasts to the end of the
 * chain is already there and is recorded. One whose replay changes something
 * is not, and the log names what it changed.
 *
 * Schema means tables, columns, constraints, indexes, functions (their whole
 * definition), triggers, policies, views, types, extensions and privileges in
 * the schemas the migrations write. Comments are not compared. Rows that a
 * migration seeds or backfills are replayed but not compared: they may have
 * been changed on purpose since, so the log reports them and nothing rests on
 * them.
 */

import { replayHazards, splitStatements } from "./sqlStatements.mjs";
import { versionFromFilename } from "./migrationChain.mjs";

export const REPLAY_SCHEMAS = ["public", "storage"];
const LEDGER = "supabase_migrations.schema_migrations";

const schemaQuery = (projection, filter = "") => `
with ns as (
  select oid, nspname, nspacl from pg_namespace where nspname = any($1::text[])
), extension_member as (
  select objid from pg_depend where deptype = 'e'
)
select ${projection} from (
select 'schema' as kind, nspname::text as id, coalesce(nspacl::text, '') as def from ns
union all
select 'relation', n.nspname || '.' || c.relname,
       c.relkind::text || ' rls=' || c.relrowsecurity::text || ' force=' || c.relforcerowsecurity::text || ' acl=' || coalesce(c.relacl::text, '')
  from pg_class c join ns n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'c') and c.oid not in (select objid from extension_member)
union all
select 'column', n.nspname || '.' || c.relname || '.' || a.attname,
       format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull::text
       || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
       || ' identity=' || a.attidentity::text || ' generated=' || a.attgenerated::text || ' acl=' || coalesce(a.attacl::text, '')
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join ns n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where a.attnum > 0 and not a.attisdropped and c.relkind in ('r', 'p', 'v', 'm', 'f')
   and c.oid not in (select objid from extension_member)
union all
select 'constraint', n.nspname || '.' || c.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
  from pg_constraint con join pg_class c on c.oid = con.conrelid join ns n on n.oid = c.relnamespace
union all
select 'index', n.nspname || '.' || i.relname, pg_get_indexdef(i.oid)
  from pg_index x join pg_class i on i.oid = x.indexrelid join ns n on n.oid = i.relnamespace
union all
select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       pg_get_functiondef(p.oid) || ' acl=' || coalesce(p.proacl::text, '')
  from pg_proc p join ns n on n.oid = p.pronamespace
 where p.prokind in ('f', 'p') and p.oid not in (select objid from extension_member)
union all
select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join ns n on n.oid = c.relnamespace
 where not t.tgisinternal
union all
select 'policy', p.schemaname || '.' || p.tablename || '.' || p.policyname,
       p.permissive || ' ' || p.cmd || ' ' || p.roles::text || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
  from pg_policies p where p.schemaname = any($1::text[])
union all
select 'view', n.nspname || '.' || c.relname, pg_get_viewdef(c.oid)
  from pg_class c join ns n on n.oid = c.relnamespace
 where c.relkind in ('v', 'm') and c.oid not in (select objid from extension_member)
union all
select 'type', n.nspname || '.' || t.typname,
       t.typtype::text || ' ' || coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '')
       || ' ' || format_type(t.typbasetype, t.typtypmod)
  from pg_type t join ns n on n.oid = t.typnamespace
 where t.typtype in ('e', 'd') and t.oid not in (select objid from extension_member)
union all
select 'extension', e.extname::text, e.extversion || ' ' || e.extnamespace::regnamespace::text from pg_extension e
union all
select 'default-privilege', d.defaclnamespace::regnamespace::text || ' ' || d.defaclrole::regrole::text || ' ' || d.defaclobjtype::text, d.defaclacl::text
  from pg_default_acl d
) definitions ${filter}
`;

// Definitions are compared by hash: only equality matters, and the hashes keep
// every reading small. The full text is read only to explain a difference.
export const SCHEMA_SNAPSHOT = schemaQuery("kind, id, md5(def) as def");
const SCHEMA_DETAIL = schemaQuery("kind, id, def", "where kind || ' ' || id = any($2::text[])");

const DETAIL_LIMIT = 120;
const WRITES = "select schemaname || '.' || relname as id, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_xact_user_tables";

/** @returns {Promise<Map<string, string>>} `kind id` → definition. */
export async function readSchema(client, schemas = REPLAY_SCHEMAS) {
  const { rows } = await client.query(SCHEMA_SNAPSHOT, [schemas]);
  return new Map(rows.map((row) => [`${row.kind} ${row.id}`, row.def]));
}

/** The full definitions behind some snapshot keys. */
export async function readDefinitions(client, keys, schemas = REPLAY_SCHEMAS) {
  if (!keys.length) return new Map();
  const { rows } = await client.query(SCHEMA_DETAIL, [schemas, keys]);
  return new Map(rows.map((row) => [`${row.kind} ${row.id}`, row.def]));
}

const clip = (text, length = 160) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/**
 * What a reader needs to judge one difference: whether the database lacks the
 * object, or holds it differently, and the lines that differ.
 */
export function describeDifference(key, database, chain, limit = 4) {
  if (database === undefined && chain === undefined) return [`${key}: not readable`];
  if (database === undefined) return [`${key}: missing from the database; the chain makes it: ${clip(chain.split("\n")[0].trim())}`];
  if (chain === undefined) return [`${key}: in the database, but the chain removes it`];
  const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);
  const held = lines(database);
  const made = lines(chain);
  const onlyHeld = held.filter((line) => !made.includes(line));
  const onlyMade = made.filter((line) => !held.includes(line));
  return [
    `${key}: held differently (${onlyHeld.length} lines only in the database, ${onlyMade.length} only in the chain)`,
    ...onlyHeld.slice(0, limit).map((line) => `  database: ${clip(line)}`),
    ...onlyMade.slice(0, limit).map((line) => `  chain:    ${clip(line)}`),
  ];
}

const TABLES_TOUCHED = /\b(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table(?:\s+if\s+exists)?(?:\s+only)?|create\s+(?:unique\s+)?index(?:\s+concurrently)?(?:\s+if\s+not\s+exists)?\s+\S+\s+on(?:\s+only)?)\s+(?:public\.)?("?[a-z_][a-z0-9_]*"?)(?![\w.])/gi;

/** The public tables a migration creates, alters or indexes. */
export function tablesTouched(sql) {
  const name = (raw) => (raw.startsWith('"') ? raw.slice(1, -1) : raw.toLowerCase());
  return [...new Set([...sql.matchAll(TABLES_TOUCHED)].map((match) => name(match[1])))].sort();
}

const TABLE_SHAPE = `
select c.relname as name,
       string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum) as columns,
       (select string_agg(distinct v.relname, ', ') from pg_depend d join pg_rewrite r on r.oid = d.objid join pg_class v on v.oid = r.ev_class
         where d.refobjid = c.oid and v.oid <> c.oid) as views
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
 where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = any($1::text[])
 group by c.oid, c.relname
 order by c.relname`;

/** One line per table: its columns as the database holds them, and the views built on it. */
export async function describeTables(client, names) {
  if (!names.length) return [];
  const { rows } = await client.query(TABLE_SHAPE, [names]);
  const found = new Map(rows.map((row) => [row.name, row]));
  return names.map((name) => {
    const row = found.get(name);
    return row ? `table public.${name} in the database: ${row.columns}; views on it: ${row.views || "none"}` : `table public.${name}: not in the database`;
  });
}

/** Keys present on one side only, or defined differently. */
export function changedKeys(before, after) {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => before.get(key) !== after.get(key)).sort();
}

async function readWrites(client) {
  const { rows } = await client.query(WRITES);
  return new Map(rows.map((row) => [row.id, [Number(row.n_tup_ins), Number(row.n_tup_upd), Number(row.n_tup_del)]]));
}

/** "public.capability_registry ~4, public.audit_log +2": rows written between two readings. */
export function describeWrites(before, after) {
  const parts = [];
  for (const [id, [inserted, updated, deleted]] of [...after.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [i0, u0, d0] = before.get(id) || [0, 0, 0];
    const counts = [inserted - i0 && `+${inserted - i0}`, updated - u0 && `~${updated - u0}`, deleted - d0 && `-${deleted - d0}`].filter(Boolean);
    if (counts.length) parts.push(`${id} ${counts.join(" ")}`);
  }
  return parts.join(", ");
}

/**
 * Runs a file that failed again, one statement at a time inside the replay,
 * to name the statement that fails. The caller rolls all of it back.
 */
async function locateFailure(client, sql, caught) {
  for (const statement of splitStatements(sql)) {
    await client.query("savepoint replay_statement");
    try {
      await client.query(statement.code);
      await client.query("release savepoint replay_statement");
    } catch (failure) {
      await client.query("rollback to savepoint replay_statement");
      return { error: `${failure.message} (line ${statement.line})`, failedStatement: statement.code };
    }
  }
  return { error: caught.message, failedStatement: null };
}

/**
 * Runs every file again inside one transaction and rolls it back. Each file
 * gets a savepoint, so one that fails is undone alone and the rest still run.
 * Past its time budget the whole replay is rolled back and nothing is judged.
 *
 * @param {{ query: Function }} client
 * @param {Array<{ file: string, sql: string }>} files  In chain order.
 */
export async function replayChain(client, files, { schemas = REPLAY_SCHEMAS, lockTimeout = "3s", statementTimeout = "60s", budgetMs = 30_000, clock = Date.now } = {}) {
  const started = clock();
  await client.query("begin");
  try {
    // A replay waits briefly for a lock and gives up, rather than queueing
    // the application's own queries behind it.
    await client.query(`set local lock_timeout = '${lockTimeout}'`);
    await client.query(`set local statement_timeout = '${statementTimeout}'`);
    const start = await readSchema(client, schemas);
    let schema = start;
    let writes = await readWrites(client);
    const replayed = [];
    for (const entry of files) {
      let failure = { error: null, failedStatement: null };
      await client.query("savepoint replay_file");
      try {
        await client.query(entry.sql);
      } catch (caught) {
        await client.query("rollback to savepoint replay_file");
        failure = await locateFailure(client, entry.sql, caught);
        await client.query("rollback to savepoint replay_file");
      }
      await client.query("release savepoint replay_file");
      const nextSchema = await readSchema(client, schemas);
      const nextWrites = await readWrites(client);
      replayed.push({ ...entry, ...failure, changed: changedKeys(schema, nextSchema), wrote: describeWrites(writes, nextWrites) });
      schema = nextSchema;
      writes = nextWrites;
      // Every lock the replay takes is held until its rollback, so it stops
      // early rather than hold the application's tables for long.
      if (clock() - started > budgetMs) throw new Error(`the replay passed its ${budgetMs / 1000}s budget after ${entry.file} and was rolled back`);
    }
    const lasting = changedKeys(start, schema);
    const detailKeys = lasting.slice(0, DETAIL_LIMIT);
    const chainDefinitions = await readDefinitions(client, detailKeys, schemas);
    return { start, replayed, lasting: new Set(lasting), detailKeys, chainDefinitions };
  } finally {
    await client.query("rollback");
  }
}

/** Something the replay changed is still there after its rollback. */
export class ReplayLeftChanges extends Error {}

const listed = (keys, limit = 8) => keys.slice(0, limit).join(", ") + (keys.length > limit ? ` and ${keys.length - limit} more` : "");

/**
 * Which missing versions the replay clears. A file is clear when it replayed
 * without error and changed nothing that lasted to the end of the chain; a
 * version is recorded only when every file carrying it is clear.
 *
 * @param {object} replay
 * @param {string[]} replay.missing       Versions the ledger lacks.
 * @param {Set<string>} replay.recorded   Versions the ledger holds.
 * @param {Array<{ file: string, version: string, error: string | null, changed: string[] }>} replay.replayed
 * @param {Set<string>} replay.lasting    What differs between the start and the end of the replay.
 */
export function judgeReplay({ missing, recorded, replayed, lasting }) {
  const reasonsFor = (entry) => {
    const lastingChanges = entry.changed.filter((key) => lasting.has(key));
    return [
      entry.error && `its replay failed: ${entry.error}`,
      lastingChanges.length && `its replay changes what the database lacks or holds differently: ${listed(lastingChanges)}`,
    ].filter(Boolean);
  };
  const judged = replayed.map((entry) => ({ entry, reasons: reasonsFor(entry), lastingChanges: entry.changed.filter((key) => lasting.has(key)) }));
  const verified = [];
  const blocked = [];
  const unrecorded = [];
  for (const version of missing) {
    const files = judged.filter(({ entry }) => entry.version === version);
    const unclear = files.filter(({ reasons }) => reasons.length);
    if (!files.length || unclear.length) {
      blocked.push(...unclear);
      unrecorded.push(version);
    } else {
      verified.push({ version, entries: files.map(({ entry }) => entry) });
    }
  }
  const notes = judged.filter(({ entry, reasons }) => recorded.has(entry.version) && reasons.length);
  return { verified, blocked, notes, unrecorded };
}

/**
 * Records in the ledger every migration missing from it whose schema the
 * replay finds already in the database, and only those.
 *
 * @param {{ query: Function }} client
 * @param {object} options
 * @param {Array<{ file: string, sql: string }>} options.files  The whole chain, in order.
 * @param {(line: string) => void} options.log
 * @returns {Promise<{ recorded: string[], unrecorded: string[] }>}
 */
export async function repairLedgerByReplay(client, { files, log, schemas = REPLAY_SCHEMAS }) {
  const { rows } = await client.query(`select version, name from ${LEDGER} order by version`);
  const ledger = new Map(rows.map((row) => [String(row.version), row.name]));
  const chain = files.map((entry) => ({ ...entry, version: versionFromFilename(entry.file) }));
  const versions = [...new Set(chain.map((entry) => entry.version))];
  const missing = versions.filter((version) => !ledger.has(version));
  const unknown = [...ledger.keys()].filter((version) => !versions.includes(version));
  if (unknown.length) log(`ledger entries not in this checkout: ${unknown.map((version) => `${version} ${ledger.get(version) || ""}`.trim()).join(", ")}`);
  if (!missing.length) return { recorded: [], unrecorded: [] };
  log(`ledger: ${versions.length - missing.length} of ${versions.length} migration versions recorded; replaying the chain to check the other ${missing.length}`);

  const refusals = chain.flatMap((entry) => replayHazards(entry.sql).map((hazard) => `${entry.file}: ${hazard}`));
  if (refusals.length) {
    for (const refusal of refusals) log(`replay refused: ${refusal}`);
    log("nothing recorded");
    return { recorded: [], unrecorded: missing };
  }

  const { start, replayed, lasting, detailKeys, chainDefinitions } = await replayChain(client, chain, { schemas });
  const left = changedKeys(start, await readSchema(client, schemas));
  if (left.length) throw new ReplayLeftChanges(`the replay's rollback left changes behind: ${listed(left)}`);

  const { verified, blocked, notes, unrecorded } = judgeReplay({ missing, recorded: new Set(ledger.keys()), replayed, lasting });
  for (const { entry, reasons } of notes) log(`note: ${entry.file} is in the ledger, but ${reasons.join("; ")}`);
  // Each file left out is explained well enough to decide what to do about it:
  // the objects that differ, or the tables a failed file touches.
  let databaseDefinitions = new Map();
  try {
    databaseDefinitions = await readDefinitions(client, detailKeys, schemas);
  } catch (error) {
    log(`the database's definitions could not be read: ${error.message}`);
  }
  for (const { entry, reasons, lastingChanges } of blocked) {
    log(`not recorded: ${entry.file}: ${reasons.join("; ")}`);
    for (const key of lastingChanges.slice(0, 6)) {
      if (!detailKeys.includes(key)) continue;
      for (const line of describeDifference(key, databaseDefinitions.get(key), chainDefinitions.get(key))) log(`  ${line}`);
    }
    if (entry.error) {
      const named = [...entry.error.matchAll(/relation "(?:public\.)?([a-z_][a-z0-9_]*)"/gi)].map((match) => match[1]);
      const tables = [...new Set([...(entry.failedStatement ? tablesTouched(entry.failedStatement) : []), ...named])].slice(0, 4);
      if (entry.failedStatement) log(`  failing statement: ${clip(entry.failedStatement.replace(/\s+/g, " "), 240)}`);
      try {
        for (const line of await describeTables(client, tables)) log(`  ${line}`);
      } catch (error) {
        log(`  its tables could not be described: ${error.message}`);
      }
    }
  }

  if (verified.length) {
    await client.query("begin");
    try {
      for (const { version, entries } of verified) {
        await client.query(
          `insert into ${LEDGER} (version, name, statements) values ($1, $2, $3) on conflict (version) do nothing`,
          [version, entries.map((entry) => entry.file.replace(/^\d+_/, "").replace(/\.sql$/, "")).join(" + "), entries.map((entry) => entry.sql)]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    }
    for (const { entries } of verified) {
      for (const entry of entries) log(`recorded: ${entry.file}, its replay changed no lasting schema${entry.wrote ? `; rows its data statements wrote, not compared: ${entry.wrote}` : ""}`);
    }
  }
  log(`ledger repair: ${verified.length} recorded, ${unrecorded.length} not recorded`);
  return { recorded: verified.map(({ version }) => version), unrecorded };
}
