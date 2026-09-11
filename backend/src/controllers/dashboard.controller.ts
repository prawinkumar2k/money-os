import { Response } from "express";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Goal } from "../models/Goal";
import { Bill } from "../models/Bill";
import { Subscription } from "../models/Subscription";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { computeNetWorth } from "../services/netWorth.service";
import { computeSpent, getCurrentPeriodRange } from "../services/budget.service";

const round2 = (n: number) => Math.round(n * 100) / 100;

export const getDashboard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;

  const monthRange = getCurrentPeriodRange("monthly");

  const [
    accounts,
    recentTransactions,
    monthTransactions,
    netWorth,
    budgets,
    goals,
    upcomingBills,
    subscriptions,
  ] = await Promise.all([
    Account.find({ userId }),
    Transaction.find({ userId }).sort({ date: -1 }).limit(10),
    Transaction.find({ userId, date: { $gte: monthRange.start, $lte: monthRange.end }, type: { $ne: "transfer" } }),
    computeNetWorth(userId),
    Budget.find({ userId }).limit(5),
    Goal.find({ userId }).limit(5),
    Bill.find({ userId, dueDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } })
      .sort({ dueDate: 1 })
      .limit(5),
    Subscription.find({ userId, status: "confirmed" }),
  ]);

  const monthlyIncome = round2(monthTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const monthlyExpenses = round2(-monthTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const monthlySavings = round2(monthlyIncome - monthlyExpenses);
  const savingsRate = monthlyIncome > 0 ? round2((monthlySavings / monthlyIncome) * 100) : 0;

  const bankBalance = accounts
    .filter((a) => a.type !== "credit_card" && a.type !== "cash")
    .reduce((s, a) => s + a.balance, 0);
  const cashBalance = accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0);
  const creditCardOutstanding = accounts
    .filter((a) => a.type === "credit_card")
    .reduce((s, a) => s + Math.max(0, -a.balance), 0);

  const budgetsWithSpent = await Promise.all(
    budgets.map(async (b) => {
      const range = getCurrentPeriodRange(b.period);
      const spent = await computeSpent(userId, b.category, range);
      const percentageUsed = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      return { _id: b._id, category: b.category, amount: b.amount, spent, percentageUsed };
    })
  );

  const goalsSummary = goals.map((g) => ({
    _id: g._id,
    name: g.name,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    progressPercentage: g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0,
  }));

  const monthlySubscriptionCost = round2(subscriptions.reduce((s, sub) => s + sub.monthlyCost, 0));

  res.json({
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
    monthlySubscriptionCost,
    accountCount: accounts.length,
    hasMockData: accounts.some((a) => a.isMockData),
    upcomingBills,
    budgets: budgetsWithSpent,
    goals: goalsSummary,
    recentTransactions,

    // Preserved for the existing frontend, which currently reads totalBalance directly.
    totalBalance: round2(accounts.reduce((s, a) => s + a.balance, 0)),
  });
});
