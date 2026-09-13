import { getDb, genId, nowIso } from "./db";
import { detectRecurringPaymentsLocal } from "./subscriptionDetection";
import type { DetectedSubscription, Subscription } from "../api/subscriptions";

function costs(amount: number, frequency: "weekly" | "monthly" | "yearly") {
  const monthlyCost = frequency === "weekly" ? amount * (30 / 7) : frequency === "monthly" ? amount : amount / 12;
  return { monthlyCost: Math.round(monthlyCost * 100) / 100, yearlyCost: Math.round(monthlyCost * 12 * 100) / 100 };
}

function rowToSubscription(row: Record<string, unknown>): Subscription {
  return {
    _id: row.id as string,
    merchant: row.merchant as string,
    name: row.name as string,
    amount: row.amount as number,
    frequency: row.frequency as "weekly" | "monthly" | "yearly",
    monthlyCost: row.monthlyCost as number,
    yearlyCost: row.yearlyCost as number,
    status: row.status as "confirmed" | "dismissed" | "cancelled",
  };
}

export async function listDetectedSubscriptionsLocal(): Promise<DetectedSubscription[]> {
  const candidates = await detectRecurringPaymentsLocal();
  const db = await getDb();
  const existing = await db.query("SELECT merchant FROM subscriptions");
  const known = new Set((existing.values ?? []).map((r) => r.merchant));
  return candidates.filter((c) => !known.has(c.merchant));
}

export async function listSubscriptionsLocal(): Promise<{ subscriptions: Subscription[]; totalMonthlyCost: number; totalYearlyCost: number }> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM subscriptions WHERE status != 'dismissed' ORDER BY createdAt DESC");
  const subscriptions = (res.values ?? []).map(rowToSubscription);
  const active = subscriptions.filter((s) => s.status === "confirmed");
  return {
    subscriptions,
    totalMonthlyCost: active.reduce((s, sub) => s + sub.monthlyCost, 0),
    totalYearlyCost: active.reduce((s, sub) => s + sub.yearlyCost, 0),
  };
}

export async function confirmSubscriptionLocal(candidate: DetectedSubscription): Promise<void> {
  const db = await getDb();
  const { monthlyCost, yearlyCost } = costs(candidate.amount, candidate.frequency);
  const now = nowIso();
  const existing = await db.query("SELECT id FROM subscriptions WHERE merchant = ?", [candidate.merchant]);
  if (existing.values?.length) {
    await db.run(
      "UPDATE subscriptions SET name = ?, amount = ?, frequency = ?, monthlyCost = ?, yearlyCost = ?, status = 'confirmed', confirmedAt = ?, updatedAt = ? WHERE merchant = ?",
      [candidate.name, candidate.amount, candidate.frequency, monthlyCost, yearlyCost, now, now, candidate.merchant]
    );
  } else {
    await db.run(
      "INSERT INTO subscriptions (id, merchant, name, amount, frequency, monthlyCost, yearlyCost, status, confirmedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)",
      [genId(), candidate.merchant, candidate.name, candidate.amount, candidate.frequency, monthlyCost, yearlyCost, now, now, now]
    );
  }
}

export async function dismissSubscriptionLocal(candidate: DetectedSubscription): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const existing = await db.query("SELECT id FROM subscriptions WHERE merchant = ?", [candidate.merchant]);
  if (existing.values?.length) {
    await db.run("UPDATE subscriptions SET name = ?, status = 'dismissed', updatedAt = ? WHERE merchant = ?", [candidate.name, now, candidate.merchant]);
  } else {
    await db.run(
      "INSERT INTO subscriptions (id, merchant, name, amount, frequency, monthlyCost, yearlyCost, status, confirmedAt, createdAt, updatedAt) VALUES (?, ?, ?, 0, 'monthly', 0, 0, 'dismissed', ?, ?, ?)",
      [genId(), candidate.merchant, candidate.name, now, now, now]
    );
  }
}

export async function cancelSubscriptionLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE subscriptions SET status = 'cancelled', updatedAt = ? WHERE id = ?", [nowIso(), id]);
}
