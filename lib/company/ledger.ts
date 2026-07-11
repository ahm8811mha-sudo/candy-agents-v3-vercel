/**
 * Legacy compatibility ledger.
 *
 * The authoritative financial source is now `accounting_journal_entries` plus
 * `accounting_journal_lines`. This module keeps its synchronous API for older
 * sales/ZATCA flows and tests, while every new entry is mirrored into the
 * authoritative accounting repository with an idempotent reference.
 */

import { scheduleLegacyLedgerMirror } from "../accountingRepository";
import { persist, fetchRows, hydrateOnce } from "../supabase";
import { VAT_RATE, splitVatInclusive } from "./zatca";

export type LedgerLine = { account: string; debit: number; credit: number };

export type LedgerEntry = {
  id: string;
  date: string;
  description: string;
  reference?: string;
  lines: LedgerLine[];
};

const entries: LedgerEntry[] = [];

function genId() {
  return `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function postEntry(input: { description: string; reference?: string; lines: LedgerLine[]; date?: string }): LedgerEntry {
  const debit = round2(input.lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(input.lines.reduce((s, l) => s + l.credit, 0));
  if (debit !== credit) {
    throw new Error(`Unbalanced entry: debit ${debit} ≠ credit ${credit}`);
  }

  const entry: LedgerEntry = {
    id: genId(),
    date: input.date || new Date().toISOString(),
    description: input.description,
    reference: input.reference,
    lines: input.lines,
  };
  entries.unshift(entry);

  // Retained as a compatibility event log only. Financial dashboards no longer
  // read from this table.
  persist("ledger_entries", {
    id: entry.id,
    date: entry.date,
    description: entry.description,
    reference: entry.reference ?? null,
    lines: entry.lines,
  });
  scheduleLegacyLedgerMirror(entry);

  return entry;
}

/** Hydrate the compatibility ledger once for legacy callers and tests. */
export const hydrateLedger = hydrateOnce(async () => {
  const rows = await fetchRows("ledger_entries", { orderBy: "date", limit: 500 });
  const seen = new Set(entries.map((e) => e.id));
  for (const r of rows) {
    if (seen.has(String(r.id))) continue;
    entries.push({
      id: String(r.id),
      date: String(r.date),
      description: String(r.description ?? ""),
      reference: r.reference ? String(r.reference) : undefined,
      lines: (r.lines as LedgerLine[]) ?? [],
    });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
});

/** Recognize a VAT-inclusive sale: debit Cash, credit Sales Revenue + VAT Payable. */
export function postSale(gross: number, reference: string, description = "مبيعات معتمدة"): LedgerEntry & { net: number; vat: number } {
  const { net, vat } = splitVatInclusive(gross);
  const entry = postEntry({
    description,
    reference,
    lines: [
      { account: "النقد (Cash)", debit: gross, credit: 0 },
      { account: "إيرادات المبيعات (Sales Revenue)", debit: 0, credit: net },
      { account: "ضريبة القيمة المضافة المستحقة (VAT Payable)", debit: 0, credit: vat },
    ],
  });
  return { ...entry, net, vat };
}

export function listEntries(limit = 100): LedgerEntry[] {
  return entries.slice(0, limit);
}

export type AccountBalance = { account: string; debit: number; credit: number; balance: number };

export function trialBalance(): { accounts: AccountBalance[]; totalDebit: number; totalCredit: number; balanced: boolean } {
  const map = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    for (const l of e.lines) {
      const cur = map.get(l.account) || { debit: 0, credit: 0 };
      cur.debit += l.debit;
      cur.credit += l.credit;
      map.set(l.account, cur);
    }
  }
  const accounts = [...map.entries()].map(([account, v]) => ({
    account,
    debit: round2(v.debit),
    credit: round2(v.credit),
    balance: round2(v.debit - v.credit),
  }));
  const totalDebit = round2(accounts.reduce((s, a) => s + a.debit, 0));
  const totalCredit = round2(accounts.reduce((s, a) => s + a.credit, 0));
  return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function ledgerTotals() {
  const tb = trialBalance();
  const find = (needle: string) => tb.accounts.find((a) => a.account.includes(needle));
  return {
    revenue: Math.abs(find("Sales Revenue")?.balance || 0),
    vatPayable: Math.abs(find("VAT Payable")?.balance || 0),
    cash: find("Cash")?.balance || 0,
    vatRate: VAT_RATE,
    entryCount: entries.length,
  };
}

/** Test helper. */
export function _clearLedger(): void {
  entries.length = 0;
}
