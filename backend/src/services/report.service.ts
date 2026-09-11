import { Transaction } from "../models/Transaction";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RangeReport {
  from: Date;
  to: Date;
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  byCategory: Array<{ category: string; total: number }>;
  transactionCount: number;
}

export async function generateRangeReport(userId: string, from: Date, to: Date): Promise<RangeReport> {
  const transactions = await Transaction.find({
    userId,
    date: { $gte: from, $lte: to },
    type: { $ne: "transfer" },
  });

  const totalIncome = round2(transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const totalExpenses = round2(-transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));

  const byCategoryMap = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const key = t.category ?? "Uncategorized";
    byCategoryMap.set(key, (byCategoryMap.get(key) ?? 0) + Math.abs(t.amount));
  }
  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);

  return {
    from,
    to,
    totalIncome,
    totalExpenses,
    netSavings: round2(totalIncome - totalExpenses),
    byCategory,
    transactionCount: transactions.length,
  };
}

export async function generateYearlyReport(userId: string, year: number) {
  const months = [];
  for (let month = 0; month < 12; month++) {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const report = await generateRangeReport(userId, from, to);
    months.push({ month: month + 1, totalIncome: report.totalIncome, totalExpenses: report.totalExpenses, netSavings: report.netSavings });
  }

  return {
    year,
    months,
    totalIncome: round2(months.reduce((s, m) => s + m.totalIncome, 0)),
    totalExpenses: round2(months.reduce((s, m) => s + m.totalExpenses, 0)),
    netSavings: round2(months.reduce((s, m) => s + m.netSavings, 0)),
  };
}
