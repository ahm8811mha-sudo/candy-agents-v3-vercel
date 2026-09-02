#!/usr/bin/env node
/**
 * Reads the database's own migration ledger and compares it with the migration
 * files in this checkout. Exits non-zero when the chain is incomplete, so the
 * `migration-chain-applied` evidence is only ever recorded after the database
 * has confirmed it — never as an attestation.
 *
 * usage: node scripts/check-migration-chain.mjs            (uses $PRODUCTION_DB_URL)
 *        node scripts/check-migration-chain.mjs --url <postgres-url>
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diffMigrationChain, describeMigrationChain, versionFromFilename } from "../lib/release/migrationChain.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(here, "..", "supabase", "migrations");

function connectionUrl() {
  const index = process.argv.indexOf("--url");
  const fromArgument = index >= 0 ? process.argv[index + 1] : "";
  return (fromArgument || process.env.PRODUCTION_DB_URL || process.env.PGURL || "").trim();
}

const url = connectionUrl();
if (!url) {
  console.error("No database URL. Set PRODUCTION_DB_URL or pass --url <postgres-url>.");
  process.exit(2);
}

const fileVersions = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .map(versionFromFilename)
  .filter((version) => Boolean(version));

let appliedVersions = [];
try {
  const output = execFileSync(
    "psql",
    [url, "-Atc", "select version from supabase_migrations.schema_migrations order by version"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  appliedVersions = output.split("\n").map((line) => line.trim()).filter(Boolean);
} catch (error) {
  const message = String(error.stderr || error.message || "");
  if (/schema_migrations|supabase_migrations/i.test(message)) {
    console.error(
      "The database has no supabase_migrations.schema_migrations ledger, so the applied chain cannot be verified.\n" +
      "Link the project with the Supabase CLI (supabase link) and record the applied migrations before this gate can pass."
    );
    process.exit(1);
  }
  console.error(`Could not read the migration ledger: ${message.trim()}`);
  process.exit(2);
}

const diff = diffMigrationChain(fileVersions, appliedVersions);
console.log(describeMigrationChain(diff));
if (diff.unknown.length) console.log(`Ledger entries not present in this checkout: ${diff.unknown.join(", ")}`);

// The details are printed as JSON so the workflow can attach them to the
// evidence row without re-deriving anything.
console.log(`::details::${JSON.stringify({
  fileCount: diff.fileCount,
  appliedCount: diff.appliedCount,
  missing: diff.missing,
  unknown: diff.unknown,
})}`);

process.exit(diff.applied ? 0 : 1);
