import { apiFetch } from "./client";

export type AnalyticsPeriod = "7d" | "30d" | "3m" | "6m" | "1y" | "all";

export interface AnalyticsData {
  period: AnalyticsPeriod;
  spendingByCategory: Array<{ category: string; total: number; count: number }>;
  spendingByMerchant: Array<{ merchant: string; total: number; count: number }>;
  cashFlow: Array<{ month: string; income: number; expenses: number; net: number }>;
  savingsRateTrend: Array<{ month: string; savingsRate: number }>;
  accountDistribution: Array<{ name: string; type: string; balance: number }>;
}

export async function getAnalytics(period: AnalyticsPeriod = "30d"): Promise<AnalyticsData> {
  return apiFetch(`/analytics?period=${period}`);
}
