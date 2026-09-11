import { apiFetch } from "./client";

export interface GoalContribution {
  amount: number;
  date: string;
  note: string | null;
}

export interface Goal {
  _id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  contributions: GoalContribution[];
  remaining: number;
  progressPercentage: number;
  requiredMonthlyContribution: number | null;
}

export interface CreateGoalInput {
  name: string;
  targetAmount: number;
  targetDate: string | null;
}

export async function listGoals(): Promise<Goal[]> {
  const data = await apiFetch("/goals");
  return data.goals;
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const data = await apiFetch("/goals", { method: "POST", body: JSON.stringify(input) });
  return data.goal;
}

export async function deleteGoal(id: string): Promise<void> {
  await apiFetch(`/goals/${id}`, { method: "DELETE" });
}

export async function addContribution(id: string, amount: number, note?: string): Promise<Goal> {
  const data = await apiFetch(`/goals/${id}/contributions`, {
    method: "POST",
    body: JSON.stringify({ amount, note: note ?? null }),
  });
  return data.goal;
}
