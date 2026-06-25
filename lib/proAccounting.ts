import { calculateFinancials } from "./accountingSystem";
import { seedEnterpriseOperatingSystem } from "./enterpriseSystems";
import { getSupabaseAdmin } from "./supabase";

type Account = {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  normal_balance: "DEBIT" | "CREDIT";
  active?: boolean;
};

type JournalLine = {
  id: string;
  entry_id: string;
  account_id: string;
  memo?: string | null;
  debit: number;
  credit: number;
};

type JournalEntry = {
  id: string;
  entry_number: string;
  entry_date: string;
  memo?: string | null;
  source?: string | null;
  status: string;
  created_at: string;
};

type InvoiceInput = {
  invoiceType: "SALES" | "PURCHASE";
  contactName: string;
  subtotal: number;
  tax?: number;
  notes?: string;
};

type JournalInput = {
  memo: string;
  debitCode: string;
  creditCode: string;
  amount: number;
  source?: string;
};

type BankInput = {
  description: string;
  amount: number;
  bankName?: string;
};

const currencyFormatter = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nowCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function getAccountsMap() {
  await seedEnterpriseOperatingSystem();
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("accounting_accounts").select("*").order("code", { ascending: true });
  if (error) throw error;

  const accounts = (data || []) as Account[];
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  return { accounts, byCode };
}

function balanceFor(account: Account, debit: number, credit: number) {
  return account.normal_balance === "DEBIT" ? debit - credit : credit - debit;
}

export async function getAccountingConsole() {
  await seedEnterpriseOperatingSystem();
  const supabase = requireSupabase();

  const [accountRows, entryRows, lineRows, contactRows, invoiceRows, bankRows, bankTransactionRows, simpleFinancials] =
    await Promise.all([
      supabase.from("accounting_accounts").select("*").order("code", { ascending: true }),
      supabase.from("accounting_journal_entries").select("*").order("created_at", { ascending: false }).limit(25),
      supabase.from("accounting_journal_lines").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("accounting_contacts").select("*").order("created_at", { ascending: false }).limit(25),
      supabase.from("accounting_invoices").select("*").order("created_at", { ascending: false }).limit(25),
      supabase.from("accounting_bank_accounts").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("accounting_bank_transactions").select("*").order("created_at", { ascending: false }).limit(25),
      calculateFinancials(),
    ]);

  for (const result of [accountRows, entryRows, lineRows, contactRows, invoiceRows, bankRows, bankTransactionRows]) {
    if (result.error) throw result.error;
  }

  const accounts = (accountRows.data || []) as Account[];
  const lines = (lineRows.data || []) as JournalLine[];
  const balances = accounts.map((account) => {
    const related = lines.filter((line) => line.account_id === account.id);
    const debit = related.reduce((sum, line) => sum + number(line.debit), 0);
    const credit = related.reduce((sum, line) => sum + number(line.credit), 0);
    return {
      ...account,
      debit,
      credit,
      balance: balanceFor(account, debit, credit),
    };
  });

  const revenue = balances.filter((account) => account.type === "REVENUE").reduce((sum, account) => sum + account.balance, 0);
  const expenses = balances.filter((account) => account.type === "EXPENSE").reduce((sum, account) => sum + account.balance, 0);
  const assets = balances.filter((account) => account.type === "ASSET").reduce((sum, account) => sum + account.balance, 0);
  const liabilities = balances.filter((account) => account.type === "LIABILITY").reduce((sum, account) => sum + account.balance, 0);
  const equity = balances.filter((account) => account.type === "EQUITY").reduce((sum, account) => sum + account.balance, 0);
  const netIncome = revenue - expenses;
  const bankCash = balances.find((account) => account.code === "1000")?.balance || simpleFinancials.income - simpleFinancials.expenses;

  const invoices = invoiceRows.data || [];
  const receivables = invoices
    .filter((invoice: any) => invoice.invoice_type === "SALES")
    .reduce((sum: number, invoice: any) => sum + number(invoice.total) - number(invoice.paid), 0);
  const payables = invoices
    .filter((invoice: any) => invoice.invoice_type === "PURCHASE")
    .reduce((sum: number, invoice: any) => sum + number(invoice.total) - number(invoice.paid), 0);

  return {
    accounts,
    balances,
    journalEntries: (entryRows.data || []) as JournalEntry[],
    journalLines: lines,
    contacts: contactRows.data || [],
    invoices,
    bankAccounts: bankRows.data || [],
    bankTransactions: bankTransactionRows.data || [],
    statements: {
      trialBalance: {
        debit: balances.reduce((sum, account) => sum + Math.max(account.debit - account.credit, 0), 0),
        credit: balances.reduce((sum, account) => sum + Math.max(account.credit - account.debit, 0), 0),
      },
      incomeStatement: { revenue, expenses, netIncome },
      balanceSheet: { assets, liabilities, equity, retainedEarnings: netIncome },
      cash: bankCash,
      receivables,
      payables,
      simpleCashBasis: simpleFinancials,
    },
    cfoSummary: buildCfoSummary({
      revenue,
      expenses,
      netIncome,
      assets,
      liabilities,
      receivables,
      payables,
      bankCash,
    }),
  };
}

export async function postJournalEntry(input: JournalInput) {
  const amount = number(input.amount);
  if (amount <= 0) throw new Error("Amount must be greater than zero.");
  if (!input.memo?.trim()) throw new Error("Memo is required.");

  const supabase = requireSupabase();
  const { byCode } = await getAccountsMap();
  const debitAccount = byCode.get(input.debitCode);
  const creditAccount = byCode.get(input.creditCode);
  if (!debitAccount || !creditAccount) throw new Error("Invalid accounting account code.");

  const { data: entry, error: entryError } = await supabase
    .from("accounting_journal_entries")
    .insert({
      entry_number: nowCode("JE"),
      memo: input.memo.trim(),
      source: input.source || "manual",
      status: "POSTED",
    })
    .select()
    .single();
  if (entryError) throw entryError;

  const { error: lineError } = await supabase.from("accounting_journal_lines").insert([
    {
      entry_id: entry.id,
      account_id: debitAccount.id,
      memo: input.memo.trim(),
      debit: amount,
      credit: 0,
    },
    {
      entry_id: entry.id,
      account_id: creditAccount.id,
      memo: input.memo.trim(),
      debit: 0,
      credit: amount,
    },
  ]);
  if (lineError) throw lineError;

  return entry;
}

export async function createAccountingInvoice(input: InvoiceInput) {
  const subtotal = number(input.subtotal);
  const tax = number(input.tax);
  const total = subtotal + tax;
  if (!input.contactName?.trim()) throw new Error("Contact name is required.");
  if (total <= 0) throw new Error("Invoice total must be greater than zero.");

  const supabase = requireSupabase();
  const contactType = input.invoiceType === "SALES" ? "CUSTOMER" : "VENDOR";
  const { data: contact, error: contactError } = await supabase
    .from("accounting_contacts")
    .insert({ type: contactType, name: input.contactName.trim() })
    .select()
    .single();
  if (contactError) throw contactError;

  const { data: invoice, error: invoiceError } = await supabase
    .from("accounting_invoices")
    .insert({
      contact_id: contact.id,
      invoice_type: input.invoiceType,
      status: "ISSUED",
      subtotal,
      tax,
      total,
      paid: 0,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (invoiceError) throw invoiceError;

  if (input.invoiceType === "SALES") {
    await postJournalEntry({
      memo: `Sales invoice ${currencyFormatter.format(total)} - ${input.contactName}`,
      debitCode: "1100",
      creditCode: "4000",
      amount: total,
      source: "invoice",
    });
  } else {
    await postJournalEntry({
      memo: `Purchase invoice ${currencyFormatter.format(total)} - ${input.contactName}`,
      debitCode: "5200",
      creditCode: "2000",
      amount: total,
      source: "invoice",
    });
  }

  return invoice;
}

export async function addBankTransaction(input: BankInput) {
  const amount = number(input.amount);
  if (!input.description?.trim()) throw new Error("Bank transaction description is required.");
  if (amount === 0) throw new Error("Bank transaction amount cannot be zero.");

  const supabase = requireSupabase();
  const bankName = input.bankName?.trim() || "Main operating bank";
  let bankAccountId = "";

  const existing = await supabase.from("accounting_bank_accounts").select("*").eq("name", bankName).limit(1);
  if (existing.error) throw existing.error;

  if (existing.data?.[0]?.id) {
    bankAccountId = existing.data[0].id;
  } else {
    const { data: account, error } = await supabase
      .from("accounting_bank_accounts")
      .insert({ name: bankName, provider: "manual", currency: "SAR", balance: 0 })
      .select()
      .single();
    if (error) throw error;
    bankAccountId = account.id;
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("accounting_bank_transactions")
    .insert({
      bank_account_id: bankAccountId,
      description: input.description.trim(),
      amount,
      status: "UNMATCHED",
    })
    .select()
    .single();
  if (transactionError) throw transactionError;

  return transaction;
}

function buildCfoSummary(data: {
  revenue: number;
  expenses: number;
  netIncome: number;
  assets: number;
  liabilities: number;
  receivables: number;
  payables: number;
  bankCash: number;
}) {
  const margin = data.revenue > 0 ? data.netIncome / data.revenue : 0;
  const debtRatio = data.assets > 0 ? data.liabilities / data.assets : 0;

  return {
    status: data.netIncome >= 0 ? "PROFITABLE" : "LOSS_MAKING",
    margin,
    debtRatio,
    cashPosition: data.bankCash,
    message:
      data.netIncome >= 0
        ? "الشركة قادرة على تشغيل تجارب تجارية صغيرة بشرط قياس CAC والهامش قبل التوسع."
        : "الأولوية الآن ضبط المصروفات ورفع الإيراد قبل اعتماد توسع جديد.",
    controls: [
      "كل مصروف تسويقي يجب أن يرتبط بحملة وهدف CAC.",
      "كل توسع يتطلب موافقة CFO إذا تجاوز 5,000 ريال.",
      "كل فرصة تتجاوز 50,000 ريال ترفع لمكتب CEO مع خطة مراحل.",
      "إغلاق شهري: قيود، فواتير، بنك، ذمم، تقرير ربح وخسارة.",
    ],
  };
}
