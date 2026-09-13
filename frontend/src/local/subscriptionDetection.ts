import { getDb } from "./db";
import { normalize } from "./categorize";
import type { DetectedSubscription } from "../api/subscriptions";

// Ported verbatim from backend/src/services/subscriptionDetection.service.ts — a heuristic
// probabilistic guess from transaction patterns, not a certain fact; presented to the user as a
// "detected" candidate to confirm or dismiss, never as an already-known subscription.
const FREQUENCY_BANDS: Array<{ frequency: "weekly" | "monthly" | "yearly"; days: number; toleranceRatio: number }> = [
  { frequency: "weekly", days: 7, toleranceRatio: 0.3 },
  { frequency: "monthly", days: 30, toleranceRatio: 0.3 },
  { frequency: "yearly", days: 365, toleranceRatio: 0.3 },
];

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export async function detectRecurringPaymentsLocal(): Promise<DetectedSubscription[]> {
  const db = await getDb();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const res = await db.query(
    `SELECT merchant, amount, date FROM "transactions" WHERE deletedAt IS NULL AND type NOT IN ('transfer', 'income') AND merchant IS NOT NULL AND date >= ? ORDER BY date ASC`,
    [sixMonthsAgo.toISOString()]
  );

  interface Group {
    name: string;
    amounts: number[];
    dates: Date[];
  }
  const groups = new Map<string, Group>();
  for (const txn of res.values ?? []) {
    if (!txn.merchant) continue;
    const key = normalize(txn.merchant);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = { name: txn.merchant, amounts: [], dates: [] };
      groups.set(key, group);
    }
    group.amounts.push(Math.abs(txn.amount));
    group.dates.push(new Date(txn.date));
  }

  const candidates: DetectedSubscription[] = [];

  for (const [merchant, group] of groups) {
    if (group.dates.length < 2) continue;

    const avgAmount = mean(group.amounts);
    const amountSpread = (Math.max(...group.amounts) - Math.min(...group.amounts)) / avgAmount;
    if (amountSpread > 0.15) continue;

    const intervals: number[] = [];
    for (let i = 1; i < group.dates.length; i++) {
      const days = (group.dates[i].getTime() - group.dates[i - 1].getTime()) / (24 * 60 * 60 * 1000);
      intervals.push(days);
    }
    const avgInterval = mean(intervals);
    const intervalStdDev = stddev(intervals, avgInterval);
    if (avgInterval === 0 || intervalStdDev / avgInterval > 0.3) continue;

    const band = FREQUENCY_BANDS.find((b) => Math.abs(avgInterval - b.days) / b.days <= b.toleranceRatio);
    if (!band) continue;

    const monthlyCost = band.frequency === "weekly" ? avgAmount * (30 / 7) : band.frequency === "monthly" ? avgAmount : avgAmount / 12;

    candidates.push({
      merchant,
      name: group.name,
      amount: Math.round(avgAmount * 100) / 100,
      frequency: band.frequency,
      monthlyCost: Math.round(monthlyCost * 100) / 100,
      yearlyCost: Math.round(monthlyCost * 12 * 100) / 100,
      occurrences: group.dates.length,
    });
  }

  return candidates;
}
