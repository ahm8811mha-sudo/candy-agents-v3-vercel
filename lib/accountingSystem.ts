import { hydrateLedger, listEntries, postEntry, type LedgerEntry } from "./company/ledger";

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
            "You are a professional financial analyst and corporate accountant. Write clear Arabic corporate reports with realistic recommendations. Treat the double-entry ledger as the source of truth.",
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

function entryToTransactions(entry: LedgerEntry): Transaction[] {
  const income = entry.lines
    .filter((line) => line.account.includes("Revenue") || line.account.includes("إيرادات"))
    .reduce((sum, line) => sum + Number(line.credit || 0), 0);

  const expense = entry.lines
    .filter((line) => line.account.includes("Expense") || line.account.includes("مصروف"))
    .reduce((sum, line) => sum + Number(line.debit || 0), 0);

  const transactions: Transaction[] = [];
  if (income > 0) {
    transactions.push({
      id: `${entry.id}-income`,
      type: "income",
      amount: round2(income),
      description: entry.description,
      created_at: entry.date,
      source: "ledger",
      reference: entry.reference,
    });
  }
  if (expense > 0) {
    transactions.push({
      id: `${entry.id}-expense`,
      type: "expense",
      amount: round2(expense),
      description: entry.description,
      created_at: entry.date,
      source: "ledger",
      reference: entry.reference,
    });
  }
  return transactions;
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
  const entry = data.type === "income"
    ? postEntry({
        description,
        reference: "manual-income",
        lines: [
          { account: "النقد (Cash)", debit: amount, credit: 0 },
          { account: "إيرادات تشغيلية (Operating Revenue)", debit: 0, credit: amount },
        ],
      })
    : postEntry({
        description,
        reference: "manual-expense",
        lines: [
          { account: "مصروفات تشغيلية (Operating Expense)", debit: amount, credit: 0 },
          { account: "النقد (Cash)", debit: 0, credit: amount },
        ],
      });

  return { success: true, entry };
}

export async function getTransactions(): Promise<Transaction[]> {
  await hydrateLedger();
  const ledgerTransactions = listEntries(500).flatMap(entryToTransactions);
  if (ledgerTransactions.length === 0) return fallbackTransactions;
  return ledgerTransactions.sort((a, b) => b.created_at.localeCompare(a.created_at));
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
    ...totals,
    profit: totals.income - totals.expenses,
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
الإيرادات الحالية ${financials.income.toLocaleString("ar-SA")} ريال، والمصروفات ${financials.expenses.toLocaleString("ar-SA")} ريال، وصافي الربح ${financials.profit.toLocaleString("ar-SA")} ريال. مصدر البيانات: ${financials.source === "ledger" ? "دفتر القيود المزدوجة" : "بيانات تجريبية"}.

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
- استخدام بيانات demo يعني أن القرار غير صالح للإنتاج حتى يتم إدخال قيود Ledger فعلية.

6. Strategic Recommendations
- اعتماد دفتر القيود المزدوجة كمصدر مالي وحيد.
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
