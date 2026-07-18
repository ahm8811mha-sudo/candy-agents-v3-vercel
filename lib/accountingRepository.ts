import { after } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { getTenantId, isMultiTenantEnabled } from "./tenant";
import { rememberDurableAuditRow } from "./company/audit";

export type AccountingEntryLineInput = {
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type AccountingEntryInput = {
  memo: string;
  source: string;
  reference?: string;
  entryDate?: string;
  costCenterId?: string;
  lines: AccountingEntryLineInput[];
};

export type AccountingTransaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  created_at: string;
  reference?: string;
};

export type AccountingInvoiceInput = {
  invoiceType: "SALES" | "PURCHASE";
  contactName: string;
  subtotal: number;
  tax?: number;
  taxRate?: number;
  costCenterId?: string;
  notes?: string;
  idempotencyKey?: string;
};

export type AccountingBankInput = {
  description: string;
  amount: number;
  bankName?: string;
  idempotencyKey?: string;
};

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash and bank", type: "ASSET", normal_balance: "DEBIT" },
  { code: "1100", name: "Accounts receivable", type: "ASSET", normal_balance: "DEBIT" },
  { code: "1200", name: "Inventory", type: "ASSET", normal_balance: "DEBIT" },
  { code: "2000", name: "Accounts payable", type: "LIABILITY", normal_balance: "CREDIT" },
  { code: "2100", name: "Tax payable", type: "LIABILITY", normal_balance: "CREDIT" },
  { code: "3000", name: "Owner equity", type: "EQUITY", normal_balance: "CREDIT" },
  { code: "4000", name: "Product revenue", type: "REVENUE", normal_balance: "CREDIT" },
  { code: "4100", name: "Service revenue", type: "REVENUE", normal_balance: "CREDIT" },
  { code: "5000", name: "Cost of goods sold", type: "EXPENSE", normal_balance: "DEBIT" },
  { code: "5100", name: "Marketing expense", type: "EXPENSE", normal_balance: "DEBIT" },
  { code: "5200", name: "Operations expense", type: "EXPENSE", normal_balance: "DEBIT" },
] as const;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured for accounting.");
  return supabase;
}

function safeIdentifier(value: string, maxLength: number) {
  return value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function createDeterministicUuid(value: string) {
  const chars = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function entryNumber(tenantId: string, reference?: string) {
  const tenant = safeIdentifier(tenantId, 24) || "tenant";
  const cleaned = reference ? safeIdentifier(reference, 72) : "";
  return `${tenant}-${cleaned || `JE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
}

async function ensureAccounts() {
  const supabase = requireSupabase();
  const { error } = await supabase.from("accounting_accounts").upsert(
    DEFAULT_ACCOUNTS.map((account) => ({ ...account, is_system: true })),
    { onConflict: "code" }
  );
  if (error) throw error;
}

function validateEntry(input: AccountingEntryInput) {
  if (!input.memo?.trim()) throw new Error("Accounting memo is required.");
  if (!input.lines?.length || input.lines.length < 2) throw new Error("A journal entry requires at least two lines.");

  const debit = round2(input.lines.reduce((sum, line) => sum + number(line.debit), 0));
  const credit = round2(input.lines.reduce((sum, line) => sum + number(line.credit), 0));
  if (debit <= 0 || debit !== credit) throw new Error(`Unbalanced journal entry: debit ${debit} ≠ credit ${credit}`);
  for (const line of input.lines) {
    if (!line.accountCode?.trim()) throw new Error("Every journal line requires an account code.");
    if (number(line.debit) < 0 || number(line.credit) < 0) throw new Error("Journal amounts cannot be negative.");
    if (number(line.debit) > 0 && number(line.credit) > 0) throw new Error("A journal line cannot contain both debit and credit.");
    if (number(line.debit) === 0 && number(line.credit) === 0) throw new Error("A journal line must contain a debit or credit amount.");
  }
}

export async function postAccountingEntry(input: AccountingEntryInput) {
  validateEntry(input);
  await ensureAccounts();

  const supabase = requireSupabase();
  const tenantId = getTenantId();
  const numberValue = entryNumber(tenantId, input.reference);
  const entryDate = input.entryDate || new Date().toISOString();

  const { data: rpcData, error: rpcError } = await supabase.rpc("orvanta_post_journal_entry", {
    p_tenant_id: tenantId,
    p_entry_number: numberValue,
    p_entry_date: entryDate,
    p_memo: input.memo.trim(),
    p_source: input.source || "system",
    p_cost_center_id: input.costCenterId || null,
    p_lines: input.lines.map((line) => ({
      account_code: line.accountCode,
      debit: round2(number(line.debit)),
      credit: round2(number(line.credit)),
      memo: line.memo?.trim() || input.memo.trim(),
    })),
  });

  if (rpcError) throw new Error(`Atomic journal posting failed: ${rpcError.message}`);
  return rpcData;
}

/** Atomically creates the contact, invoice, balanced journal, and audit row. */
export async function createAccountingInvoiceAtomic(input: AccountingInvoiceInput) {
  const subtotal = round2(number(input.subtotal));
  const tax = round2(number(input.tax));
  const total = round2(subtotal + tax);
  const contactName = input.contactName?.trim();
  if (!contactName) throw new Error("Contact name is required.");
  if (!["SALES", "PURCHASE"].includes(input.invoiceType)) throw new Error("Invalid invoice type.");
  if (subtotal < 0 || tax < 0 || total <= 0) throw new Error("Invoice total must be greater than zero.");

  await ensureAccounts();
  const supabase = requireSupabase();
  const tenantId = getTenantId();
  const invoiceId = randomUUID();
  const token = safeIdentifier(input.idempotencyKey || invoiceId, 72) || invoiceId;
  const prefix = input.invoiceType === "SALES" ? "TAX-S" : "TAX-P";
  const taxInvoiceNumber = `${prefix}-${token}`;
  const journalEntryNumber = entryNumber(tenantId, `INVOICE-${token}`);
  const { data, error } = await supabase.rpc("orvanta_create_accounting_invoice", {
    p_tenant_id: tenantId,
    p_invoice: {
      id: invoiceId,
      contactId: randomUUID(),
      invoiceType: input.invoiceType,
      contactName,
      subtotal,
      tax,
      taxRate: number(input.taxRate) || (subtotal > 0 ? tax / subtotal : 0),
      taxInvoiceNumber,
      entryNumber: journalEntryNumber,
      costCenterId: input.costCenterId || null,
      notes: input.notes?.trim() || null,
    },
  });
  if (error) throw new Error(`Atomic invoice posting failed: ${error.message}`);
  if (!data || typeof data !== "object") throw new Error("Atomic invoice posting returned an invalid response.");
  const result = data as Record<string, unknown>;
  if (result.audit && typeof result.audit === "object") {
    rememberDurableAuditRow(result.audit as Record<string, unknown>);
  }
  return result;
}

/** Atomically records a bank transaction and updates its account balance. */
export async function addAccountingBankTransactionAtomic(input: AccountingBankInput) {
  const description = input.description?.trim();
  const amount = round2(number(input.amount));
  if (!description) throw new Error("Bank transaction description is required.");
  if (amount === 0) throw new Error("Bank transaction amount cannot be zero.");

  const supabase = requireSupabase();
  const tenantId = getTenantId();
  const transactionId = input.idempotencyKey
    ? createDeterministicUuid(`${tenantId}:bank:${input.idempotencyKey}`)
    : randomUUID();
  const { data, error } = await supabase.rpc("orvanta_add_bank_transaction", {
    p_tenant_id: tenantId,
    p_transaction: {
      bankAccountId: randomUUID(),
      transactionId,
      bankName: input.bankName?.trim() || "Main operating bank",
      description,
      amount,
    },
  });
  if (error) throw new Error(`Atomic bank transaction failed: ${error.message}`);
  if (!data || typeof data !== "object") throw new Error("Atomic bank transaction returned an invalid response.");
  const result = data as Record<string, unknown>;
  if (result.audit && typeof result.audit === "object") {
    rememberDurableAuditRow(result.audit as Record<string, unknown>);
  }
  return result;
}

export async function listAccountingTransactions(limit = 500): Promise<AccountingTransaction[]> {
  await ensureAccounts();
  const supabase = requireSupabase();
  const tenantId = getTenantId();

  let entryQuery = supabase
    .from("accounting_journal_entries")
    .select("id, entry_number, entry_date, memo, source, created_at, status")
    .eq("status", "POSTED")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 1000));
  if (isMultiTenantEnabled()) entryQuery = entryQuery.eq("tenant_id", tenantId);

  const [entryRows, accountRows] = await Promise.all([
    entryQuery,
    supabase.from("accounting_accounts").select("id, code, type"),
  ]);
  if (entryRows.error) throw entryRows.error;
  if (accountRows.error) throw accountRows.error;

  const entries = entryRows.data || [];
  if (!entries.length) return [];
  const entryIds = entries.map((entry: any) => entry.id);

  let lineQuery = supabase
    .from("accounting_journal_lines")
    .select("entry_id, account_id, debit, credit")
    .in("entry_id", entryIds);
  if (isMultiTenantEnabled()) lineQuery = lineQuery.eq("tenant_id", tenantId);
  const lineRows = await lineQuery;
  if (lineRows.error) throw lineRows.error;

  const accountType = new Map((accountRows.data || []).map((account: any) => [String(account.id), String(account.type)]));
  const linesByEntry = new Map<string, any[]>();
  for (const line of lineRows.data || []) {
    const key = String((line as any).entry_id);
    const existing = linesByEntry.get(key) || [];
    existing.push(line);
    linesByEntry.set(key, existing);
  }

  const transactions: AccountingTransaction[] = [];
  for (const entry of entries as any[]) {
    const lines = linesByEntry.get(String(entry.id)) || [];
    const income = round2(
      lines
        .filter((line) => accountType.get(String(line.account_id)) === "REVENUE")
        .reduce((sum, line) => sum + number(line.credit) - number(line.debit), 0)
    );
    const expense = round2(
      lines
        .filter((line) => accountType.get(String(line.account_id)) === "EXPENSE")
        .reduce((sum, line) => sum + number(line.debit) - number(line.credit), 0)
    );
    const createdAt = String(entry.entry_date || entry.created_at || new Date().toISOString());
    const description = String(entry.memo || entry.source || "Accounting entry");
    const reference = entry.entry_number ? String(entry.entry_number) : undefined;

    if (income > 0) {
      transactions.push({
        id: `${entry.id}-income`,
        type: "income",
        amount: income,
        description,
        created_at: createdAt,
        reference,
      });
    }
    if (expense > 0) {
      transactions.push({
        id: `${entry.id}-expense`,
        type: "expense",
        amount: expense,
        description,
        created_at: createdAt,
        reference,
      });
    }
  }

  return transactions.sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function legacyAccountCode(account: string) {
  const value = account.toLowerCase();
  if (value.includes("marketing") || value.includes("تسويق")) return "5100";
  if (value.includes("cost of goods") || value.includes("تكلفة")) return "5000";
  if (value.includes("expense") || value.includes("مصروف")) return "5200";
  if (value.includes("revenue") || value.includes("إيراد")) return "4000";
  if (value.includes("vat") || value.includes("ضريبة القيمة")) return "2100";
  if (value.includes("receivable") || value.includes("ذمم مدينة")) return "1100";
  if (value.includes("payable") || value.includes("ذمم دائنة")) return "2000";
  if (value.includes("inventory") || value.includes("مخزون")) return "1200";
  if (value.includes("equity") || value.includes("حقوق")) return "3000";
  return "1000";
}

async function recordLegacyMirrorFailure(
  entry: {
    id: string;
    date: string;
    description: string;
    reference?: string;
    lines: Array<{ account: string; debit: number; credit: number }>;
  },
  error: unknown
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const message = error instanceof Error ? error.message : String(error);
  const { error: recordError } = await supabase.from("failed_writes").insert({
    tenant_id: getTenantId(),
    table_name: "accounting_journal_entries",
    operation: "LEGACY_LEDGER_MIRROR",
    payload: {
      id: entry.id,
      date: entry.date,
      description: entry.description,
      reference: entry.reference || null,
      lines: entry.lines,
    },
    error_message: message.slice(0, 2000),
    status: "PENDING",
    attempts: 1,
  });
  if (recordError) {
    console.error("[orvanta:accounting] failed to record legacy mirror failure", {
      entryId: entry.id,
      error: recordError.message,
    });
  }
}

export function scheduleLegacyLedgerMirror(entry: {
  id: string;
  date: string;
  description: string;
  reference?: string;
  lines: Array<{ account: string; debit: number; credit: number }>;
}) {
  if (!getSupabaseAdmin()) return;
  const write = postAccountingEntry({
    memo: entry.description,
    source: "legacy-ledger-adapter",
    reference: `LEGACY-${entry.id}`,
    entryDate: entry.date,
    lines: entry.lines.map((line) => ({
      accountCode: legacyAccountCode(line.account),
      debit: line.debit,
      credit: line.credit,
      memo: line.account,
    })),
  }).catch(async (error) => {
    console.error("[orvanta:accounting] legacy ledger mirror failed", {
      entryId: entry.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await recordLegacyMirrorFailure(entry, error);
  });

  try {
    after(write);
  } catch {
    void write;
  }
}
