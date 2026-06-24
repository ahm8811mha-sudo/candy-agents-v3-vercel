import { getSupabaseAdmin } from "./supabase";

export type TransactionType = "income" | "expense";

export type TransactionInput = {
  type: TransactionType;
  amount: number;
  description: string;
};

export type Transaction = TransactionInput & {
  id: string;
  created_at: string;
};

export type Financials = {
  income: number;
  expenses: number;
  profit: number;
  transactionCount: number;
};

const fallbackTransactions: Transaction[] = [
  {
    id: "demo-income",
    type: "income",
    amount: 15000,
    description: "مبيعات متجر",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-expense",
    type: "expense",
    amount: 5000,
    description: "إعلانات تسويق",
    created_at: new Date().toISOString(),
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
            "You are a professional financial analyst and corporate accountant. Write clear Arabic corporate reports with realistic recommendations.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || fallback;
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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase غير مضبوط. لا يمكن حفظ العملية المالية.");
  }

  const { error } = await supabase.from("transactions").insert({
    type: data.type,
    amount: data.amount,
    description: data.description.trim(),
  });

  if (error) throw error;
  return { success: true };
}

export async function getTransactions(): Promise<Transaction[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallbackTransactions;

  const { data, error } = await supabase
    .from("transactions")
    .select("id,type,amount,description,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Transaction[];
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
  };
}

export async function generateFinancialReport() {
  const [financials, transactions] = await Promise.all([
    calculateFinancials(),
    getTransactions(),
  ]);

  const fallback = `
1. Executive Summary
الإيرادات الحالية ${financials.income.toLocaleString("ar-SA")} ريال، والمصروفات ${financials.expenses.toLocaleString("ar-SA")} ريال، وصافي الربح ${financials.profit.toLocaleString("ar-SA")} ريال.

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

6. Strategic Recommendations
- اعتماد ميزانية شهرية لكل قسم.
- مراجعة التدفق النقدي أسبوعيًا.
- إيقاف أي مصروف لا يرتبط بمؤشر أداء واضح.
`.trim();

  const report = await runFinancialAI(
    `
Financial Data:
Revenue: ${financials.income}
Expenses: ${financials.expenses}
Profit: ${financials.profit}
Transactions:
${transactions.map((t) => `- ${t.type}: ${t.amount} | ${t.description}`).join("\n")}

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
