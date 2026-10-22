import {
  listAccountingTransactions,
  postAccountingEntry,
  type AccountingTransaction,
} from "./accountingRepository";
import { hasSupabaseEnv } from "./supabase";

export type TransactionType = "income" | "expense";

export type TransactionInput = {
  type: TransactionType;
  amount: number;
  description: string;
};

export type Transaction = TransactionInput & {
  id: string;
  created_at: string;
  source: "ledger" | "demo";
  reference?: string;
};

export type Financials = {
  income: number;
  expenses: number;
  profit: number;
  transactionCount: number;
  source?: "ledger" | "demo";
};

const fallbackTransactions: Transaction[] = [
  {
    id: "demo-income",
    type: "income",
    amount: 15000,
    description: "مبيعات متجر، بيانات تجريبية حتى يُربط الدفتر",
    created_at: new Date().toISOString(),
    source: "demo",
  },
  {
    id: "demo-expense",
    type: "expense",
    amount: 5000,
    description: "إعلانات تسويق، بيانات تجريبية حتى يُربط الدفتر",
    created_at: new Date().toISOString(),
    source: "demo",
  },
];

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function toTransaction(item: AccountingTransaction): Transaction {
  return {
    id: item.id,
    type: item.type,
    amount: item.amount,
    description: item.description,
    created_at: item.created_at,
    reference: item.reference,
    source: "ledger",
  };
}

export async function addTransaction(data: TransactionInput) {
  if (!["income", "expense"].includes(data.type)) {
    throw new Error("نوع العملية غير صحيح.");
  }
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  }
  if (!data.description.trim()) {
    throw new Error("وصف العملية مطلوب.");
  }

  const amount = round2(data.amount);
  const description = data.description.trim();
  const entry = await postAccountingEntry({
    memo: description,
    source: "manual-simple-accounting",
    reference: `${data.type.toUpperCase()}-${Date.now()}`,
    lines:
      data.type === "income"
        ? [
            { accountCode: "1000", debit: amount, credit: 0, memo: description },
            { accountCode: "4000", debit: 0, credit: amount, memo: description },
          ]
        : [
            { accountCode: "5200", debit: amount, credit: 0, memo: description },
            { accountCode: "1000", debit: 0, credit: amount, memo: description },
          ],
  });

  return { success: true, entry };
}

export async function getTransactions(): Promise<Transaction[]> {
  if (!hasSupabaseEnv()) return fallbackTransactions;
  const transactions = await listAccountingTransactions(500);
  return transactions.map(toTransaction);
}

export async function calculateFinancials(): Promise<Financials> {
  const configured = hasSupabaseEnv();
  const transactions = await getTransactions();
  const totals = transactions.reduce(
    (acc, transaction) => {
      const amount = Number(transaction.amount) || 0;
      if (transaction.type === "income") acc.income += amount;
      if (transaction.type === "expense") acc.expenses += amount;
      return acc;
    },
    { income: 0, expenses: 0 }
  );

  return {
    income: round2(totals.income),
    expenses: round2(totals.expenses),
    profit: round2(totals.income - totals.expenses),
    transactionCount: transactions.length,
    source: configured ? "ledger" : "demo",
  };
}
