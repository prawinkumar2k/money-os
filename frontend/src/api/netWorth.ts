import { apiFetch } from "./client";

export interface NetWorthSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  breakdown: {
    bankAndCashBalances: number;
    investments: number;
    creditCardDebt: number;
    loanDebt: number;
  };
  monthlyChange: number | null;
  yearlyChange: number | null;
}

export interface NetWorthSnapshot {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

export async function getNetWorth(): Promise<NetWorthSummary> {
  return apiFetch("/net-worth");
}

export async function getNetWorthHistory(days = 90): Promise<NetWorthSnapshot[]> {
  const data = await apiFetch(`/net-worth/history?days=${days}`);
  return data.snapshots;
}
