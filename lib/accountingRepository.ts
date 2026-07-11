import { after } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import { getTenantId, isMultiTenantEnabled, withTenant } from "./tenant";

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

  if (!rpcError) return rpcData;

  // Compatibility fallback until the operational hardening migration is applied.
  let existingQuery = supabase
    .from("accounting_journal_entries")
    .select("*")
    .eq("entry_number", numberValue)
    .limit(1);
  if (isMultiTenantEnabled()) existingQuery = existingQuery.eq("tenant_id", tenantId);
  const existing = await existingQuery;
  if (existing.error) throw existing.error;
  if (existing.data?.[0]) return existing.data[0];

  const { data: accounts, error: accountsError } = await supabase
    .from("accounting_accounts")
    .select("id, code");
  if (accountsError) throw accountsError;
  const accountByCode = new Map((accounts || []).map((account: any) => [String(account.code), account.id]));

  const entryPayload = withTenant(
    {
      entry_number: numberValue,
      entry_date: entryDate,
      memo: input.memo.trim(),
      source: input.source || "system",
      status: "POSTED",
      cost_center_id: input.costCenterId || null,
    },
    tenantId
  );
  const { data: entry, error: entryError } = await supabase
    .from("accounting_journal_entries")
    .insert(entryPayload)
    .select()
    .single();
  if (entryError) throw entryError;

  const linePayload = input.lines.map((line) => {
    const accountId = accountByCode.get(line.accountCode);
    if (!accountId) throw new Error(`Accounting account ${line.accountCode} is missing.`);
    return withTenant(
      {
        entry_id: entry.id,
        account_id: accountId,
        memo: line.memo?.trim() || input.memo.trim(),
        debit: round2(number(line.debit)),
        credit: round2(number(line.credit)),
      },
      tenantId
    );
  });

  const { error: lineError } = await supabase.from("accounting_journal_lines").insert(linePayload);
  if (lineError) {
    await supabase.from("accounting_journal_entries").delete().eq("id", entry.id);
    throw lineError;
  }

  return entry;
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

function legacyAccountCode(account: string) {
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
