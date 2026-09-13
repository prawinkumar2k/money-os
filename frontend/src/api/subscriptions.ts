import { apiFetch } from "./client";
import { isNative } from "../local/db";
import {
  listDetectedSubscriptionsLocal,
  listSubscriptionsLocal,
  confirmSubscriptionLocal,
  dismissSubscriptionLocal,
  cancelSubscriptionLocal,
} from "../local/subscriptions";

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
  if (isNative) return listDetectedSubscriptionsLocal();
  const data = await apiFetch("/subscriptions/detected");
  return data.detected;
}

export async function listSubscriptions(): Promise<{
  subscriptions: Subscription[];
  totalMonthlyCost: number;
  totalYearlyCost: number;
}> {
  if (isNative) return listSubscriptionsLocal();
  return apiFetch("/subscriptions");
}

export async function confirmSubscription(candidate: DetectedSubscription): Promise<void> {
  if (isNative) return confirmSubscriptionLocal(candidate);
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
  if (isNative) return dismissSubscriptionLocal(candidate);
  await apiFetch("/subscriptions/dismiss", {
    method: "POST",
    body: JSON.stringify({ merchant: candidate.merchant, name: candidate.name }),
  });
}

export async function cancelSubscription(id: string): Promise<void> {
  if (isNative) return cancelSubscriptionLocal(id);
  await apiFetch(`/subscriptions/${id}/cancel`, { method: "POST" });
}
