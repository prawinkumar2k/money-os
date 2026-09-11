import { Bill } from "../models/Bill";
import { Budget } from "../models/Budget";
import { CreditCard } from "../models/CreditCard";
import { Account } from "../models/Account";
import { Goal } from "../models/Goal";
import { Notification, NotificationType } from "../models/Notification";
import { computeSpent, getCurrentPeriodRange } from "./budget.service";

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function createIfNotRecent(userId: string, type: NotificationType, relatedId: string, title: string, message: string) {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const existing = await Notification.findOne({ userId, type, relatedId, createdAt: { $gte: since } });
  if (existing) return;
  await Notification.create({ userId, type, relatedId, title, message });
}

/**
 * Scans the user's real data for conditions worth surfacing and creates notifications for any
 * that don't already have a recent one (deduped per type+item so this is safe to call on every
 * page load rather than needing a background scheduler, which this app doesn't have yet).
 */
export async function generateNotifications(userId: string): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const bills = await Bill.find({ userId, dueDate: { $lte: soon } });
  for (const bill of bills) {
    if (bill.dueDate < now) {
      await createIfNotRecent(userId, "bill_overdue", String(bill._id), "Bill overdue", `${bill.name} (₹${bill.amount}) is overdue.`);
    } else if (bill.dueDate <= new Date(now.getTime() + bill.reminderDaysBefore * 24 * 60 * 60 * 1000)) {
      await createIfNotRecent(userId, "bill_due_soon", String(bill._id), "Bill due soon", `${bill.name} (₹${bill.amount}) is due ${bill.dueDate.toLocaleDateString()}.`);
    }
  }

  const budgets = await Budget.find({ userId });
  for (const budget of budgets) {
    const range = getCurrentPeriodRange(budget.period);
    const spent = await computeSpent(userId, budget.category, range);
    const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    if (pct >= 90) {
      await createIfNotRecent(
        userId,
        "budget_alert",
        String(budget._id),
        "Budget nearly exhausted",
        `${budget.category ?? "Overall"} budget is at ${Math.round(pct)}% (₹${spent} of ₹${budget.amount}).`
      );
    }
  }

  const creditCards = await CreditCard.find({ userId });
  for (const card of creditCards) {
    const account = await Account.findById(card.accountId);
    if (!account || !account.creditLimit) continue;
    const outstanding = Math.max(0, -account.balance);
    const pct = (outstanding / account.creditLimit) * 100;
    if (pct >= 75) {
      await createIfNotRecent(userId, "high_credit_utilization", String(card._id), "High credit utilization", `${account.name} is at ${Math.round(pct)}% utilization.`);
    }
  }

  const goals = await Goal.find({ userId, targetDate: { $ne: null } });
  for (const goal of goals) {
    if (!goal.targetDate) continue;
    const monthsRemaining = (goal.targetDate.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000);
    const progressPct = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
    if (monthsRemaining > 0 && monthsRemaining < 1 && progressPct < 90) {
      await createIfNotRecent(userId, "goal_behind_schedule", String(goal._id), "Goal behind schedule", `${goal.name} is at ${Math.round(progressPct)}% with less than a month to its target date.`);
    }
  }
}
