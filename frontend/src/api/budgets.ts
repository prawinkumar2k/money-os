import { apiFetch } from "./client";

export interface Budget {
  _id: string;
  category: string | null;
  amount: number;
  period: "weekly" | "monthly";
  rollover: boolean;
  periodStart: string;
  periodEnd: string;
  spent: number;
  effectiveLimit: number;
  remaining: number;
  percentageUsed: number;
  alertLevel: 50 | 75 | 90 | 100 | null;
}

export interface CreateBudgetInput {
  category: string | null;
  amount: number;
  period: "weekly" | "monthly";
  rollover: boolean;
}

export async function listBudgets(): Promise<Budget[]> {
  const data = await apiFetch("/budgets");
  return data.budgets;
}

export async function createBudget(input: CreateBudgetInput): Promise<Budget> {
  const data = await apiFetch("/budgets", { method: "POST", body: JSON.stringify(input) });
  return data.budget;
}

export async function deleteBudget(id: string): Promise<void> {
  await apiFetch(`/budgets/${id}`, { method: "DELETE" });
}
