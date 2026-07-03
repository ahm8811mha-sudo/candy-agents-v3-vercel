/**
 * One-call hydration for the whole company OS.
 *
 * Each in-memory module hydrates its store from Supabase at most once per
 * process (see `hydrateOnce` in lib/supabase.ts). API routes await this before
 * their first read so a cold serverless instance is populated from durable
 * storage; after that, in-memory + write-through keeps everything in sync.
 * No-op when Supabase is not configured.
 */

import { hydrateApprovals } from "../approvals";
import { hydrateDecisions } from "../decisions";
import { hydrateIdeas } from "./ideas";
import { hydrateLedger } from "./ledger";
import { hydrateInvoices } from "./zatca";
import { hydrateSales } from "./sales";
import { hydrateAudit } from "./audit";

export async function hydrateCompany(): Promise<void> {
  await Promise.all([
    hydrateApprovals(),
    hydrateDecisions(),
    hydrateIdeas(),
    hydrateLedger(),
    hydrateInvoices(),
    hydrateSales(),
    hydrateAudit(),
  ]);
}
