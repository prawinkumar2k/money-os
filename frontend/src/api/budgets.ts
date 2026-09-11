import { apiFetch } from "./client";
import { isNative } from "../local/db";
import { listBudgetsLocal, createBudgetLocal, deleteBudgetLocal } from "../local/budgets";

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
  if (isNative) return listBudgetsLocal();
  const data = await apiFetch("/budgets");
  return data.budgets;
}

export async function createBudget(input: CreateBudgetInput): Promise<Budget> {
  if (isNative) return createBudgetLocal(input);
  const data = await apiFetch("/budgets", { method: "POST", body: JSON.stringify(input) });
  return data.budget;
}

export async function deleteBudget(id: string): Promise<void> {
  if (isNative) return deleteBudgetLocal(id);
  await apiFetch(`/budgets/${id}`, { method: "DELETE" });
}
