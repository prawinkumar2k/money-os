import { getDb } from "./db";
import type { AnalyticsData, AnalyticsPeriod } from "../api/analytics";

const round2 = (n: number) => Math.round(n * 100) / 100;

function periodToStartDate(period: AnalyticsPeriod): Date | null {
  const now = new Date();
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d;
    }
    case "6m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d;
    }
    case "1y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    case "all":
      return null;
  }
}

interface TxnRow {
  amount: number;
  type: string;
  category: string | null;
  merchant: string | null;
  date: string;
}

async function getPeriodTransactions(period: AnalyticsPeriod): Promise<TxnRow[]> {
  const db = await getDb();
  const start = periodToStartDate(period);
  const where = ["deletedAt IS NULL"];
  const params: unknown[] = [];
  if (start) {
    where.push("date >= ?");
    params.push(start.toISOString());
  }
  const res = await db.query(`SELECT amount, type, category, merchant, date FROM "transactions" WHERE ${where.join(" AND ")}`, params);
  return res.values ?? [];
}

export async function getAnalyticsLocal(period: AnalyticsPeriod = "30d"): Promise<AnalyticsData> {
  const db = await getDb();
  const rows = await getPeriodTransactions(period);

  const spendRows = rows.filter((r) => r.type !== "transfer" && r.type !== "income" && r.amount < 0);

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const r of spendRows) {
    const key = r.category ?? "Uncategorized";
    const entry = byCategory.get(key) ?? { total: 0, count: 0 };
    entry.total += Math.abs(r.amount);
    entry.count += 1;
    byCategory.set(key, entry);
  }
  const spendingByCategory = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total);

  const byMerchant = new Map<string, { total: number; count: number }>();
  for (const r of spendRows) {
    if (!r.merchant) continue;
    const entry = byMerchant.get(r.merchant) ?? { total: 0, count: 0 };
    entry.total += Math.abs(r.amount);
    entry.count += 1;
    byMerchant.set(r.merchant, entry);
  }
  const spendingByMerchant = Array.from(byMerchant.entries())
    .map(([merchant, v]) => ({ merchant, total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const cashFlowRows = rows.filter((r) => r.type !== "transfer");
  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const r of cashFlowRows) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = byMonth.get(key) ?? { income: 0, expenses: 0 };
    if (r.amount > 0) entry.income += r.amount;
    else if (r.amount < 0) entry.expenses += Math.abs(r.amount);
    byMonth.set(key, entry);
  }
  const cashFlow = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, income: round2(v.income), expenses: round2(v.expenses), net: round2(v.income - v.expenses) }));

  const savingsRateTrend = cashFlow.map((row) => ({
    month: row.month,
    savingsRate: row.income > 0 ? round2(((row.income - row.expenses) / row.income) * 100) : 0,
  }));

  const accountsRes = await db.query("SELECT name, type, balance FROM accounts WHERE deletedAt IS NULL");
  const accountDistribution = (accountsRes.values ?? []).map((a) => ({ name: a.name, type: a.type, balance: a.balance }));

  return { period, spendingByCategory, spendingByMerchant, cashFlow, savingsRateTrend, accountDistribution };
}
