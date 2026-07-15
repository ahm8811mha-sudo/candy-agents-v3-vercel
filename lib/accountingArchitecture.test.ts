import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("canonical accounting repository", () => {
  it("keeps the professional console away from direct journal, invoice, and bank writes", () => {
    const facade = source("lib/proAccounting.ts");
    expect(facade).toContain("postAccountingEntry(");
    expect(facade).toContain("createAccountingInvoiceAtomic(");
    expect(facade).toContain("addAccountingBankTransactionAtomic(");
    expect(facade).not.toContain('.from("accounting_journal_entries").insert');
    expect(facade).not.toContain('.from("accounting_invoices").insert');
    expect(facade).not.toContain('.from("accounting_bank_transactions").insert');
  });

  it("fails closed instead of using the old multi-insert journal fallback", () => {
    const repository = source("lib/accountingRepository.ts");
    expect(repository).toContain("Atomic journal posting failed");
    expect(repository).not.toContain("Compatibility fallback until the operational hardening migration is applied");
  });

  it("keeps accounting write RPCs service-only and atomic", () => {
    const migration = source("supabase/migrations/202607150004_accounting_repository_consolidation.sql");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("public.orvanta_create_accounting_invoice");
    expect(migration).toContain("public.orvanta_add_bank_transaction");
    expect(migration).toContain("public.orvanta_post_journal_entry");
    expect(migration).toContain("from public, anon, authenticated");
  });
});
