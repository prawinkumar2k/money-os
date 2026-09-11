import { apiFetch } from "./client";
import { isNative } from "../local/db";
import { listGoalsLocal, createGoalLocal, deleteGoalLocal, addContributionLocal } from "../local/goals";

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
  if (isNative) return listGoalsLocal();
  const data = await apiFetch("/goals");
  return data.goals;
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  if (isNative) return createGoalLocal(input);
  const data = await apiFetch("/goals", { method: "POST", body: JSON.stringify(input) });
  return data.goal;
}

export async function deleteGoal(id: string): Promise<void> {
  if (isNative) return deleteGoalLocal(id);
  await apiFetch(`/goals/${id}`, { method: "DELETE" });
}

export async function addContribution(id: string, amount: number, note?: string): Promise<Goal> {
  if (isNative) return addContributionLocal(id, amount, note);
  const data = await apiFetch(`/goals/${id}/contributions`, {
    method: "POST",
    body: JSON.stringify({ amount, note: note ?? null }),
  });
  return data.goal;
}
