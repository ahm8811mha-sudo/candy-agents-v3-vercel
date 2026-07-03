/**
 * F4 — Double-entry ledger (docs/ROADMAP.md).
 *
 * Every posted entry must balance (Σ debits = Σ credits). Recognizing sales
 * revenue splits a VAT-inclusive gross amount into net revenue + VAT payable,
 * so the company books stay compliant and the trial balance always balances.
 * Pure/deterministic, fully testable; Supabase persistence is a follow-up.
 */

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
  return entry;
}

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
