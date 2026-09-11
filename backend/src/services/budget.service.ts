import { Transaction } from "../models/Transaction";

export interface PeriodRange {
  start: Date;
  end: Date;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function getCurrentPeriodRange(period: "weekly" | "monthly", now: Date = new Date()): PeriodRange {
  if (period === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: startOfDay(start), end: endOfDay(end) };
  }

  // Weekly: Monday-Sunday.
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: startOfDay(start), end: endOfDay(end) };
}

export function getPreviousPeriodRange(period: "weekly" | "monthly", current: PeriodRange): PeriodRange {
  if (period === "monthly") {
    const prevMonthEnd = new Date(current.start);
    prevMonthEnd.setDate(0); // last day of previous month
    const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
    return { start: startOfDay(prevMonthStart), end: endOfDay(prevMonthEnd) };
  }

  const prevEnd = new Date(current.start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - 6);
  return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
}

/**
 * Amount actually spent in a category (or across all categories, if null) within a date range,
 * derived from real transactions. Transfers are excluded (moving your own money is not spending).
 * Refunds/income naturally offset expenses because we sum signed amounts and negate.
 */
export async function computeSpent(userId: string, category: string | null, range: PeriodRange): Promise<number> {
  const match: Record<string, unknown> = {
    userId,
    type: { $ne: "transfer" },
    date: { $gte: range.start, $lte: range.end },
  };
  if (category !== null) match.category = category;

  const transactions = await Transaction.find(match).select("amount");
  const netAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  return Math.max(0, -netAmount);
}

export function computeAlertLevel(percentageUsed: number): 50 | 75 | 90 | 100 | null {
  if (percentageUsed >= 100) return 100;
  if (percentageUsed >= 90) return 90;
  if (percentageUsed >= 75) return 75;
  if (percentageUsed >= 50) return 50;
  return null;
}
