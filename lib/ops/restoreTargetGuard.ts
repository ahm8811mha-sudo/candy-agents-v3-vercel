import { pathToFileURL } from "node:url";

/** Isolated Supabase project the drill is allowed to overwrite. */
export const APPROVED_RESTORE_PROJECT_REF = "jejdisbbtgkmpkredxtv";

const PROJECT_REF = /^[a-z0-9]{20}$/;

export class RestoreTargetRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreTargetRejected";
  }
}

function parseDatabaseUrl(value: string, which: "production" | "restore"): URL {
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      throw new Error("protocol");
    }
    if (!url.hostname) throw new Error("host");
    return url;
  } catch (error) {
    if (error instanceof RestoreTargetRejected) throw error;
    throw new RestoreTargetRejected(
      which === "production"
        ? "Restore aborted: PRODUCTION_DB_URL could not be parsed."
        : "Restore aborted: RESTORE_DB_URL could not be parsed."
    );
  }
}

function projectRefFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const fromHost = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  if (fromHost && PROJECT_REF.test(fromHost[1])) return fromHost[1];
  const user = decodeURIComponent(url.username).toLowerCase();
  const fromUser = user.match(/^postgres\.([a-z0-9]{20})$/);
  if (fromUser && PROJECT_REF.test(fromUser[1])) return fromUser[1];
  return null;
}

function isSupabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith(".supabase.co") || host.includes("pooler.supabase.com");
}

export function assertRestoreTargetIsolated(input: {
  productionUrl: string;
  restoreUrl: string;
  approvedRestoreRef?: string;
  restoreTargetInput?: string;
}): void {
  const production = parseDatabaseUrl(input.productionUrl, "production");
  const restore = parseDatabaseUrl(input.restoreUrl, "restore");
  const productionHost = production.hostname.toLowerCase();
  const restoreHost = restore.hostname.toLowerCase();
  const approved = (input.approvedRestoreRef || APPROVED_RESTORE_PROJECT_REF).toLowerCase();

  if (productionHost === restoreHost) {
    throw new RestoreTargetRejected(
      "Restore aborted: RESTORE_DB_URL host equals the PRODUCTION_DB_URL host."
    );
  }

  const productionRef = projectRefFromUrl(production);
  if (!productionRef && isSupabaseHost(productionHost)) {
    throw new RestoreTargetRejected(
      "Restore aborted: the production project ref could not be identified."
    );
  }

  if (productionRef && restoreHost.includes(productionRef)) {
    throw new RestoreTargetRejected(
      "Restore aborted: RESTORE_DB_URL host contains the production project ref."
    );
  }

  if (productionRef && input.restoreUrl.toLowerCase().includes(productionRef)) {
    throw new RestoreTargetRejected(
      "Restore aborted: RESTORE_DB_URL contains the production project ref."
    );
  }

  if (!input.restoreUrl.toLowerCase().includes(approved)) {
    throw new RestoreTargetRejected(
      "Restore aborted: RESTORE_DB_URL is not the approved isolated restore project."
    );
  }

  const namedTarget = input.restoreTargetInput?.trim().toLowerCase();
  if (namedTarget) {
    if (productionRef && namedTarget === productionRef) {
      throw new RestoreTargetRejected(
        "Restore aborted: restore_target is the production project ref."
      );
    }
    if (namedTarget !== approved) {
      throw new RestoreTargetRejected(
        "Restore aborted: restore_target is not the approved isolated restore project."
      );
    }
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const productionUrl = process.env.PRODUCTION_DB_URL || "";
  const restoreUrl = process.env.RESTORE_DB_URL || "";
  if (!productionUrl || !restoreUrl) {
    console.error("Restore aborted: PRODUCTION_DB_URL and RESTORE_DB_URL must both be set.");
    process.exit(1);
  }
  try {
    assertRestoreTargetIsolated({
      productionUrl,
      restoreUrl,
      approvedRestoreRef: process.env.APPROVED_RESTORE_PROJECT_REF || APPROVED_RESTORE_PROJECT_REF,
      restoreTargetInput: process.env.RESTORE_TARGET,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore aborted.";
    console.error(message);
    process.exit(1);
  }
}
