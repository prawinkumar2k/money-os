import { apiFetch } from "./client";

export interface DetectedSubscription {
  merchant: string;
  name: string;
  amount: number;
  frequency: "weekly" | "monthly" | "yearly";
  monthlyCost: number;
  yearlyCost: number;
  occurrences: number;
}

export interface Subscription {
  _id: string;
  merchant: string;
  name: string;
  amount: number;
  frequency: "weekly" | "monthly" | "yearly";
  monthlyCost: number;
  yearlyCost: number;
  status: "confirmed" | "dismissed" | "cancelled";
}

export async function listDetectedSubscriptions(): Promise<DetectedSubscription[]> {
  const data = await apiFetch("/subscriptions/detected");
  return data.detected;
}

export async function listSubscriptions(): Promise<{
  subscriptions: Subscription[];
  totalMonthlyCost: number;
  totalYearlyCost: number;
}> {
  return apiFetch("/subscriptions");
}

export async function confirmSubscription(candidate: DetectedSubscription): Promise<void> {
  await apiFetch("/subscriptions/confirm", {
    method: "POST",
    body: JSON.stringify({
      merchant: candidate.merchant,
      name: candidate.name,
      amount: candidate.amount,
      frequency: candidate.frequency,
    }),
  });
}

export async function dismissSubscription(candidate: DetectedSubscription): Promise<void> {
  await apiFetch("/subscriptions/dismiss", {
    method: "POST",
    body: JSON.stringify({ merchant: candidate.merchant, name: candidate.name }),
  });
}

export async function cancelSubscription(id: string): Promise<void> {
  await apiFetch(`/subscriptions/${id}/cancel`, { method: "POST" });
}
