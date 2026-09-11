import { Transaction } from "../models/Transaction";
import { normalize } from "./categorization.service";

export interface DetectedSubscription {
  merchant: string; // normalized key
  name: string; // original merchant text, for display
  amount: number; // average absolute amount
  frequency: "weekly" | "monthly" | "yearly";
  monthlyCost: number;
  yearlyCost: number;
  occurrences: number;
}

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

/**
 * Heuristic recurring-payment detector. This is a probabilistic guess from transaction
 * patterns (amount + interval consistency), not a certain fact — callers must present it as
 * a "detected" candidate the user confirms or dismisses, never as an already-known subscription.
 */
export async function detectRecurringPayments(userId: string): Promise<DetectedSubscription[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const transactions = await Transaction.find({
    userId,
    type: { $nin: ["transfer", "income"] },
    merchant: { $ne: null },
    date: { $gte: sixMonthsAgo },
  })
    .select("merchant amount date")
    .sort({ date: 1 });

  const groups = new Map<string, { name: string; amounts: number[]; dates: Date[] }>();
  for (const txn of transactions) {
    if (!txn.merchant) continue;
    const key = normalize(txn.merchant);
    if (!key) continue;
    const group = groups.get(key) ?? { name: txn.merchant, amounts: [], dates: [] };
    group.amounts.push(Math.abs(txn.amount));
    group.dates.push(txn.date);
    groups.set(key, group);
  }

  const candidates: DetectedSubscription[] = [];

  for (const [merchant, group] of groups) {
    if (group.dates.length < 2) continue;

    const avgAmount = mean(group.amounts);
    const amountSpread = (Math.max(...group.amounts) - Math.min(...group.amounts)) / avgAmount;
    if (amountSpread > 0.15) continue; // amounts vary too much to be a fixed recurring charge

    const intervals: number[] = [];
    for (let i = 1; i < group.dates.length; i++) {
      const days = (group.dates[i].getTime() - group.dates[i - 1].getTime()) / (24 * 60 * 60 * 1000);
      intervals.push(days);
    }
    const avgInterval = mean(intervals);
    const intervalStdDev = stddev(intervals, avgInterval);
    if (avgInterval === 0 || intervalStdDev / avgInterval > 0.3) continue; // interval too irregular

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
