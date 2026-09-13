import { getDb, genId, nowIso } from "./db";
import { computeSpentForBudgetLocal } from "./budgets";
import type { Notification } from "../api/notifications";

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function createIfNotRecent(db: Awaited<ReturnType<typeof getDb>>, type: string, relatedId: string, title: string, message: string) {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const existing = await db.query("SELECT id FROM notifications WHERE type = ? AND relatedId = ? AND createdAt >= ?", [type, relatedId, since]);
  if (existing.values?.length) return;
  await db.run("INSERT INTO notifications (id, type, relatedId, title, message, read, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)", [
    genId(),
    type,
    relatedId,
    title,
    message,
    nowIso(),
  ]);
}

// Ported from backend/src/services/notification.service.ts — scans real local data for
// conditions worth surfacing, deduped per type+item so it's safe to call on every page load.
async function generateNotificationsLocal(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const billsRes = await db.query("SELECT * FROM bills WHERE deletedAt IS NULL AND dueDate <= ?", [soon]);
  for (const bill of billsRes.values ?? []) {
    const dueDate = new Date(bill.dueDate);
    if (dueDate < now) {
      await createIfNotRecent(db, "bill_overdue", bill.id, "Bill overdue", `${bill.name} (₹${bill.amount}) is overdue.`);
    } else if (dueDate.getTime() <= now.getTime() + bill.reminderDaysBefore * 24 * 60 * 60 * 1000) {
      await createIfNotRecent(db, "bill_due_soon", bill.id, "Bill due soon", `${bill.name} (₹${bill.amount}) is due ${dueDate.toLocaleDateString()}.`);
    }
  }

  const budgetsRes = await db.query("SELECT * FROM budgets WHERE deletedAt IS NULL");
  for (const budget of budgetsRes.values ?? []) {
    const spent = await computeSpentForBudgetLocal(budget.category, budget.period);
    const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    if (pct >= 90) {
      await createIfNotRecent(
        db,
        "budget_alert",
        budget.id,
        "Budget nearly exhausted",
        `${budget.category ?? "Overall"} budget is at ${Math.round(pct)}% (₹${spent} of ₹${budget.amount}).`
      );
    }
  }

  const cardsRes = await db.query("SELECT * FROM credit_cards WHERE deletedAt IS NULL");
  for (const card of cardsRes.values ?? []) {
    const accountRes = await db.query("SELECT name, balance, creditLimit FROM accounts WHERE id = ?", [card.accountId]);
    const account = accountRes.values?.[0];
    if (!account || !account.creditLimit) continue;
    const outstanding = Math.max(0, -account.balance);
    const pct = (outstanding / account.creditLimit) * 100;
    if (pct >= 75) {
      await createIfNotRecent(db, "high_credit_utilization", card.id, "High credit utilization", `${account.name} is at ${Math.round(pct)}% utilization.`);
    }
  }

  const goalsRes = await db.query("SELECT * FROM goals WHERE deletedAt IS NULL AND targetDate IS NOT NULL");
  for (const goal of goalsRes.values ?? []) {
    const monthsRemaining = (new Date(goal.targetDate).getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000);
    const progressPct = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
    if (monthsRemaining > 0 && monthsRemaining < 1 && progressPct < 90) {
      await createIfNotRecent(db, "goal_behind_schedule", goal.id, "Goal behind schedule", `${goal.name} is at ${Math.round(progressPct)}% with less than a month to its target date.`);
    }
  }
}

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    _id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    message: row.message as string,
    read: !!row.read,
    createdAt: row.createdAt as string,
  };
}

export async function listNotificationsLocal(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  await generateNotificationsLocal();
  const db = await getDb();
  const res = await db.query("SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 50");
  const unreadRes = await db.query("SELECT COUNT(*) as count FROM notifications WHERE read = 0");
  return {
    notifications: (res.values ?? []).map(rowToNotification),
    unreadCount: unreadRes.values?.[0]?.count ?? 0,
  };
}

export async function markNotificationReadLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE notifications SET read = 1 WHERE id = ?", [id]);
}

export async function markAllNotificationsReadLocal(): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE notifications SET read = 1 WHERE read = 0");
}
