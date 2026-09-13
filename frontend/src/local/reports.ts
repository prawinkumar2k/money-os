import { getDb } from "./db";
import type { MonthlyReport, YearlyReport } from "../api/reports";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function generateRangeReportLocal(from: Date, to: Date): Promise<MonthlyReport> {
  const db = await getDb();
  const res = await db.query(
    `SELECT amount, category FROM "transactions" WHERE deletedAt IS NULL AND type != 'transfer' AND date >= ? AND date <= ?`,
    [from.toISOString(), to.toISOString()]
  );
  const transactions = res.values ?? [];

  const totalIncome = round2(transactions.filter((t) => t.amount > 0).reduce((s: number, t: { amount: number }) => s + t.amount, 0));
  const totalExpenses = round2(-transactions.filter((t) => t.amount < 0).reduce((s: number, t: { amount: number }) => s + t.amount, 0));

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
    from: from.toISOString(),
    to: to.toISOString(),
    totalIncome,
    totalExpenses,
    netSavings: round2(totalIncome - totalExpenses),
    byCategory,
    transactionCount: transactions.length,
  };
}

export async function getMonthlyReportLocal(year: number, month: number): Promise<MonthlyReport> {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return generateRangeReportLocal(from, to);
}

export async function getYearlyReportLocal(year: number): Promise<YearlyReport> {
  const months = [];
  for (let month = 0; month < 12; month++) {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const report = await generateRangeReportLocal(from, to);
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
