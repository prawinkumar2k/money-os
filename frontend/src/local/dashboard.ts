import { getDb } from "./db";
import { computeNetWorthLocal } from "./netWorth";
import { getCurrentPeriodRange } from "./budgetCalc";
import type { DashboardSummary } from "../api/accounts";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function computeSpentLocal(category: string | null, range: { start: Date; end: Date }): Promise<number> {
  const db = await getDb();
  const where = ["deletedAt IS NULL", "type != 'transfer'", "date >= ?", "date <= ?"];
  const params: unknown[] = [range.start.toISOString(), range.end.toISOString()];
  if (category !== null) {
    where.push("category = ?");
    params.push(category);
  }
  const res = await db.query(`SELECT amount FROM "transactions" WHERE ${where.join(" AND ")}`, params);
  const netAmount = (res.values ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  return Math.max(0, -netAmount);
}

export async function getDashboardLocal(): Promise<DashboardSummary> {
  const db = await getDb();

  const accountsRes = await db.query("SELECT * FROM accounts WHERE deletedAt IS NULL");
  const accounts = accountsRes.values ?? [];

  const recentRes = await db.query(`SELECT * FROM "transactions" WHERE deletedAt IS NULL ORDER BY date DESC, createdAt DESC LIMIT 10`);
  const recentTransactions = (recentRes.values ?? []).map((t) => ({
    _id: t.id,
    description: t.description,
    amount: t.amount,
    date: t.date,
    category: t.category ?? null,
    isMockData: false,
  }));

  const monthRange = getCurrentPeriodRange("monthly");
  const monthRes = await db.query(
    `SELECT amount FROM "transactions" WHERE deletedAt IS NULL AND type != 'transfer' AND date >= ? AND date <= ?`,
    [monthRange.start.toISOString(), monthRange.end.toISOString()]
  );
  const monthTransactions = monthRes.values ?? [];
  const monthlyIncome = round2(monthTransactions.filter((t: { amount: number }) => t.amount > 0).reduce((s: number, t: { amount: number }) => s + t.amount, 0));
  const monthlyExpenses = round2(-monthTransactions.filter((t: { amount: number }) => t.amount < 0).reduce((s: number, t: { amount: number }) => s + t.amount, 0));
  const monthlySavings = round2(monthlyIncome - monthlyExpenses);
  const savingsRate = monthlyIncome > 0 ? round2((monthlySavings / monthlyIncome) * 100) : 0;

  const bankBalance = accounts.filter((a) => a.type !== "credit_card" && a.type !== "cash").reduce((s: number, a: { balance: number }) => s + a.balance, 0);
  const cashBalance = accounts.filter((a) => a.type === "cash").reduce((s: number, a: { balance: number }) => s + a.balance, 0);
  const creditCardOutstanding = accounts.filter((a) => a.type === "credit_card").reduce((s: number, a: { balance: number }) => s + Math.max(0, -a.balance), 0);

  const budgetsRes = await db.query("SELECT * FROM budgets WHERE deletedAt IS NULL LIMIT 5");
  const budgets = [];
  for (const b of budgetsRes.values ?? []) {
    const range = getCurrentPeriodRange(b.period);
    const spent = await computeSpentLocal(b.category, range);
    const percentageUsed = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    budgets.push({ _id: b.id, category: b.category ?? null, amount: b.amount, spent, percentageUsed });
  }

  const goalsRes = await db.query("SELECT * FROM goals WHERE deletedAt IS NULL LIMIT 5");
  const goals = (goalsRes.values ?? []).map((g) => ({
    _id: g.id,
    name: g.name,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    progressPercentage: g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0,
  }));

  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const billsRes = await db.query("SELECT * FROM bills WHERE deletedAt IS NULL AND dueDate <= ? ORDER BY dueDate ASC LIMIT 5", [weekAhead]);
  const upcomingBills = (billsRes.values ?? []).map((b) => {
    const daysUntilDue = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const status = daysUntilDue < 0 ? "overdue" : daysUntilDue <= b.reminderDaysBefore ? "due_soon" : "upcoming";
    return { _id: b.id, name: b.name, amount: b.amount, dueDate: b.dueDate, status };
  });

  const netWorth = await computeNetWorthLocal();

  return {
    netWorth: netWorth.netWorth,
    totalAssets: netWorth.totalAssets,
    totalLiabilities: netWorth.totalLiabilities,
    bankBalance: round2(bankBalance),
    cashBalance: round2(cashBalance),
    investmentsValue: netWorth.breakdown.investments,
    creditCardOutstanding: round2(creditCardOutstanding),
    loanDebt: netWorth.breakdown.loanDebt,
    monthlyIncome,
    monthlyExpenses,
    monthlySavings,
    savingsRate,
    // Subscriptions aren't localized yet (see readme.md) — real 0, not a fabricated figure.
    monthlySubscriptionCost: 0,
    totalBalance: round2(accounts.reduce((s: number, a: { balance: number }) => s + a.balance, 0)),
    accountCount: accounts.length,
    hasMockData: false,
    upcomingBills,
    budgets,
    goals,
    recentTransactions,
  };
}
