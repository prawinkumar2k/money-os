import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";

export type AnalyticsPeriod = "7d" | "30d" | "3m" | "6m" | "1y" | "all";

// Transaction.aggregate() bypasses Mongoose's automatic query casting (unlike find()), so a
// string userId would never match the ObjectId stored on documents — every $match below must
// cast explicitly or it silently returns zero rows.
function toObjectId(userId: string) {
  return new Types.ObjectId(userId);
}

export function periodToStartDate(period: AnalyticsPeriod): Date | null {
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

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getSpendingByCategory(userId: string, period: AnalyticsPeriod) {
  const start = periodToStartDate(period);
  const match: Record<string, unknown> = { userId: toObjectId(userId), type: { $nin: ["transfer", "income"] }, amount: { $lt: 0 } };
  if (start) match.date = { $gte: start };

  const rows = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: "$category", total: { $sum: { $abs: "$amount" } }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);

  return rows.map((r) => ({ category: r._id ?? "Uncategorized", total: round2(r.total), count: r.count }));
}

export async function getSpendingByMerchant(userId: string, period: AnalyticsPeriod, limit = 10) {
  const start = periodToStartDate(period);
  const match: Record<string, unknown> = { userId: toObjectId(userId), type: { $nin: ["transfer", "income"] }, amount: { $lt: 0 }, merchant: { $ne: null } };
  if (start) match.date = { $gte: start };

  const rows = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: "$merchant", total: { $sum: { $abs: "$amount" } }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({ merchant: r._id, total: round2(r.total), count: r.count }));
}

export async function getCashFlow(userId: string, period: AnalyticsPeriod) {
  const start = periodToStartDate(period);
  const match: Record<string, unknown> = { userId: toObjectId(userId), type: { $ne: "transfer" } };
  if (start) match.date = { $gte: start };

  const rows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { year: { $year: "$date" }, month: { $month: "$date" } },
        income: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
        expenses: { $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] } },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  return rows.map((r) => ({
    month: `${r._id.year}-${String(r._id.month).padStart(2, "0")}`,
    income: round2(r.income),
    expenses: round2(r.expenses),
    net: round2(r.income - r.expenses),
  }));
}

export async function getIncomeExpenseTrend(userId: string, period: AnalyticsPeriod) {
  return getCashFlow(userId, period); // same aggregation serves both views
}

export async function getSavingsRateTrend(userId: string, period: AnalyticsPeriod) {
  const cashFlow = await getCashFlow(userId, period);
  return cashFlow.map((row) => ({
    month: row.month,
    savingsRate: row.income > 0 ? round2(((row.income - row.expenses) / row.income) * 100) : 0,
  }));
}
