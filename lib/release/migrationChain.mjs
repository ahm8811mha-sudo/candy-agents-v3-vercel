/**
 * Migration-chain verification.
 *
 * The `migration-baseline` readiness gate must answer one question honestly:
 * is every migration in this repository actually applied to the database the
 * app talks to? The answer cannot be an attestation flag — it has to be read
 * off the database's own migration ledger and compared with the files.
 *
 * This module is the comparison itself, kept pure so it can be tested without a
 * database, and plain JavaScript so the CI script can import it directly.
 */

/**
 * `20260721000100_decision_commitments.sql` → `20260721000100`.
 * @param {string} filename
 * @returns {string | null}
 */
export function versionFromFilename(filename) {
  const base = filename.replace(/^.*\//, "");
  const match = /^(\d+)_/.exec(base);
  return match ? match[1] : null;
}

/**
 * @typedef {object} MigrationChainDiff
 * @property {string[]} missing   In the repository but not recorded as applied.
 * @property {string[]} unknown   Recorded as applied but absent from this checkout.
 * @property {number} fileCount
 * @property {number} appliedCount
 * @property {boolean} applied
 */

/**
 * A chain is applied when every repository migration is recorded. Extra ledger
 * rows are reported but do not fail the check: a database may legitimately carry
 * migrations from a branch that has since been squashed, and failing on that
 * would push people toward deleting ledger history to get a green gate.
 *
 * @param {string[]} fileVersions
 * @param {string[]} appliedVersions
 * @returns {MigrationChainDiff}
 */
export function diffMigrationChain(fileVersions, appliedVersions) {
  const files = [...new Set(fileVersions.filter(Boolean))].sort();
  const applied = new Set(appliedVersions.map((value) => String(value).trim()).filter(Boolean));
  const missing = files.filter((version) => !applied.has(version));
  const unknown = [...applied].filter((version) => !files.includes(version)).sort();
  return {
    missing,
    unknown,
    fileCount: files.length,
    appliedCount: applied.size,
    applied: missing.length === 0 && files.length > 0,
  };
}

/**
 * One line an operator can act on, whether the check passed or failed.
 * @param {MigrationChainDiff} diff
 * @returns {string}
 */
export function describeMigrationChain(diff) {
  if (diff.fileCount === 0) return "No migration files were found; nothing could be verified.";
  if (diff.applied) {
    return `All ${diff.fileCount} migrations are recorded as applied${diff.unknown.length ? ` (${diff.unknown.length} extra ledger entries are not in this checkout)` : ""}.`;
  }
  return `${diff.missing.length} of ${diff.fileCount} migrations are not recorded as applied: ${diff.missing.join(", ")}. Apply them, or if they were applied by hand, record them with "supabase migration repair --status applied <version>".`;
}
