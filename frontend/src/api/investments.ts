import { apiFetch } from "./client";

export interface Investment {
  _id: string;
  name: string;
  type: string;
  units: number;
  avgBuyPrice: number;
  investedAmount: number;
  currentPrice: number;
  isManualPrice: boolean;
  priceUpdatedAt: string;
  accountId: string | null;
  currentValue: number;
  profitLoss: number;
  returnPercent: number;
}

export interface CreateInvestmentInput {
  name: string;
  type: string;
  currentPrice: number;
  accountId?: string | null;
}

export async function listInvestments(): Promise<{
  investments: Investment[];
  totalInvested: number;
  totalCurrentValue: number;
  totalProfitLoss: number;
}> {
  return apiFetch("/investments");
}

export async function createInvestment(input: CreateInvestmentInput): Promise<Investment> {
  const data = await apiFetch("/investments", { method: "POST", body: JSON.stringify(input) });
  return data.investment;
}

export async function deleteInvestment(id: string): Promise<void> {
  await apiFetch(`/investments/${id}`, { method: "DELETE" });
}

export async function buyInvestment(id: string, units: number, pricePerUnit: number): Promise<Investment> {
  const data = await apiFetch(`/investments/${id}/buy`, { method: "POST", body: JSON.stringify({ units, pricePerUnit }) });
  return data.investment;
}

export async function sellInvestment(id: string, units: number, pricePerUnit: number): Promise<Investment> {
  const data = await apiFetch(`/investments/${id}/sell`, { method: "POST", body: JSON.stringify({ units, pricePerUnit }) });
  return data.investment;
}

export async function updateInvestmentPrice(id: string, currentPrice: number): Promise<Investment> {
  const data = await apiFetch(`/investments/${id}/price`, { method: "POST", body: JSON.stringify({ currentPrice }) });
  return data.investment;
}
