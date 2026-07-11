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
    description: "مبيعات متجر — بيانات تجريبية حتى يتم ربط الدفتر",
    created_at: new Date().toISOString(),
    source: "demo",
  },
  {
    id: "demo-expense",
    type: "expense",
    amount: 5000,
    description: "إعلانات تسويق — بيانات تجريبية حتى يتم ربط الدفتر",
    created_at: new Date().toISOString(),
    source: "demo",
  },
];

async function runFinancialAI(prompt: string, fallback: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are a professional financial analyst and corporate accountant. Write clear Arabic corporate reports with realistic recommendations. Treat the accounting journal as the only financial source of truth.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || fallback;
}

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
    source: transactions.some((item) => item.source === "ledger") ? "ledger" : "demo",
  };
}

export async function generateFinancialReport() {
  const [financials, transactions] = await Promise.all([
    calculateFinancials(),
    getTransactions(),
  ]);

  const fallback = `
1. Executive Summary
الإيرادات الحالية ${financials.income.toLocaleString("ar-SA")} ريال، والمصروفات ${financials.expenses.toLocaleString("ar-SA")} ريال، وصافي الربح ${financials.profit.toLocaleString("ar-SA")} ريال. مصدر البيانات: ${financials.source === "ledger" ? "دفتر القيود المحاسبي الموحد" : "بيانات تجريبية"}.

2. Revenue Analysis
يجب متابعة مصادر الإيراد الأعلى وربطها بقنوات البيع الأكثر كفاءة.

3. Expense Breakdown
المصروفات تحتاج تصنيفًا دوريًا بين تسويق، تشغيل، رواتب، أدوات، وموردين.

4. Profitability Analysis
الربحية ${financials.profit >= 0 ? "إيجابية" : "سلبية"} حاليًا، ويجب مراقبة الهامش بعد كل حملة أو توسع.

5. Financial Risks
- ارتفاع المصروفات قبل ثبات الإيرادات.
- غياب حد صرف شهري.
- عدم فصل مصروفات التسويق عن التشغيل.
- استخدام بيانات demo يعني أن القرار غير صالح للإنتاج حتى يتم إدخال قيود فعلية.

6. Strategic Recommendations
- اعتماد دفتر القيود المحاسبي الموحد كمصدر مالي وحيد.
- مراجعة التدفق النقدي أسبوعيًا.
- إيقاف أي مصروف لا يرتبط بمؤشر أداء واضح.
`.trim();

  const report = await runFinancialAI(
    `
Financial Data:
Source: ${financials.source}
Revenue: ${financials.income}
Expenses: ${financials.expenses}
Profit: ${financials.profit}
Transactions:
${transactions.map((t) => `- ${t.type}: ${t.amount} | ${t.description} | source=${t.source}`).join("\n")}

Generate a professional financial report including:
1. Executive Summary
2. Revenue Analysis
3. Expense Breakdown
4. Profitability Analysis
5. Financial Risks
6. Strategic Recommendations
`,
    fallback
  );

  return {
    ...financials,
    transactions,
    report,
  };
}
