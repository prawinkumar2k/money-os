import { getDb, genId, nowIso } from "./db";
import type { CreateGoalInput, Goal, GoalContribution } from "../api/goals";

const MS_PER_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000;

async function withComputedFields(row: Record<string, unknown>, contributions: GoalContribution[]): Promise<Goal> {
  const targetAmount = row.targetAmount as number;
  const currentAmount = row.currentAmount as number;
  const targetDate = (row.targetDate as string | null) ?? null;

  const remaining = Math.max(0, targetAmount - currentAmount);
  const progressPercentage = targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0;

  let requiredMonthlyContribution: number | null = null;
  if (targetDate && remaining > 0) {
    const monthsRemaining = (new Date(targetDate).getTime() - Date.now()) / MS_PER_MONTH;
    requiredMonthlyContribution = monthsRemaining > 0 ? remaining / monthsRemaining : null;
  }

  return {
    _id: row.id as string,
    name: row.name as string,
    targetAmount,
    currentAmount,
    targetDate,
    contributions,
    remaining,
    progressPercentage,
    requiredMonthlyContribution,
  };
}

async function getContributions(db: Awaited<ReturnType<typeof getDb>>, goalId: string): Promise<GoalContribution[]> {
  const res = await db.query("SELECT amount, date, note FROM goal_contributions WHERE goalId = ? ORDER BY date ASC", [goalId]);
  return (res.values ?? []).map((r: { amount: number; date: string; note: string | null }) => ({
    amount: r.amount,
    date: r.date,
    note: r.note ?? null,
  }));
}

export async function listGoalsLocal(): Promise<Goal[]> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM goals WHERE deletedAt IS NULL ORDER BY createdAt DESC");
  const goals: Goal[] = [];
  for (const row of res.values ?? []) {
    goals.push(await withComputedFields(row, await getContributions(db, row.id)));
  }
  return goals;
}

export async function createGoalLocal(input: CreateGoalInput): Promise<Goal> {
  const db = await getDb();
  const id = genId();
  const now = nowIso();
  await db.run("INSERT INTO goals (id, name, targetAmount, currentAmount, targetDate, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, ?)", [
    id,
    input.name,
    input.targetAmount,
    input.targetDate,
    now,
    now,
  ]);
  const res = await db.query("SELECT * FROM goals WHERE id = ?", [id]);
  return withComputedFields(res.values![0], []);
}

export async function deleteGoalLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE goals SET deletedAt = ? WHERE id = ?", [nowIso(), id]);
}

export async function addContributionLocal(id: string, amount: number, note?: string): Promise<Goal> {
  const db = await getDb();
  const now = nowIso();
  await db.run("INSERT INTO goal_contributions (id, goalId, amount, date, note) VALUES (?, ?, ?, ?, ?)", [genId(), id, amount, now, note ?? null]);
  await db.run("UPDATE goals SET currentAmount = MAX(0, currentAmount + ?), updatedAt = ? WHERE id = ?", [amount, now, id]);

  const res = await db.query("SELECT * FROM goals WHERE id = ?", [id]);
  return withComputedFields(res.values![0], await getContributions(db, id));
}
