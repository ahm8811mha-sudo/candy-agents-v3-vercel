/** Types for migrationChain.mjs, which stays plain JavaScript so the CI script
 *  can import it without a TypeScript loader. */

export type MigrationChainDiff = {
  /** In the repository but not recorded as applied. */
  missing: string[];
  /** Recorded as applied but absent from this checkout. */
  unknown: string[];
  fileCount: number;
  appliedCount: number;
  applied: boolean;
};

export function versionFromFilename(filename: string): string | null;
export function diffMigrationChain(fileVersions: string[], appliedVersions: string[]): MigrationChainDiff;
export function describeMigrationChain(diff: MigrationChainDiff): string;
