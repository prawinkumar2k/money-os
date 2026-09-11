import { getDb, genId, nowIso } from "./db";
import { computeAlertLevel, getCurrentPeriodRange, getPreviousPeriodRange, PeriodRange } from "./budgetCalc";
import type { Budget, CreateBudgetInput } from "../api/budgets";

async function computeSpentLocal(category: string | null, range: PeriodRange): Promise<number> {
  const db = await getDb();
  const where = ["deletedAt IS NULL", "type != 'transfer'", "date >= ?", "date <= ?"];
  const params: unknown[] = [range.start.toISOString(), range.end.toISOString()];
  if (category !== null) {
    where.push("category = ?");
    params.push(category);
  }
  const res = await db.query(`SELECT amount FROM "transactions" WHERE ${where.join(" AND ")}`, params);
  const netAmount = (res.values ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  return Math.max(0, -netAmount);
}

async function withComputedFields(row: Record<string, unknown>): Promise<Budget> {
  const period = row.period as "weekly" | "monthly";
  const category = (row.category as string | null) ?? null;
  const amount = row.amount as number;
  const rollover = !!row.rollover;

  const currentRange = getCurrentPeriodRange(period);
  const spent = await computeSpentLocal(category, currentRange);

  let effectiveLimit = amount;
  if (rollover) {
    const previousRange = getPreviousPeriodRange(period, currentRange);
    const previousSpent = await computeSpentLocal(category, previousRange);
    effectiveLimit += Math.max(0, amount - previousSpent);
  }

  const remaining = effectiveLimit - spent;
  const percentageUsed = effectiveLimit > 0 ? Math.round((spent / effectiveLimit) * 100) : 0;

  return {
    _id: row.id as string,
    category,
    amount,
    period,
    rollover,
    periodStart: currentRange.start.toISOString(),
    periodEnd: currentRange.end.toISOString(),
    spent,
    effectiveLimit,
    remaining,
    percentageUsed,
    alertLevel: computeAlertLevel(percentageUsed),
  };
}

export async function listBudgetsLocal(): Promise<Budget[]> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM budgets WHERE deletedAt IS NULL ORDER BY createdAt DESC");
  return Promise.all((res.values ?? []).map(withComputedFields));
}

export async function createBudgetLocal(input: CreateBudgetInput): Promise<Budget> {
  const db = await getDb();
  const id = genId();
  const now = nowIso();
  await db.run("INSERT INTO budgets (id, category, amount, period, rollover, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    id,
    input.category,
    input.amount,
    input.period,
    input.rollover ? 1 : 0,
    now,
    now,
  ]);
  const res = await db.query("SELECT * FROM budgets WHERE id = ?", [id]);
  return withComputedFields(res.values![0]);
}

export async function deleteBudgetLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE budgets SET deletedAt = ? WHERE id = ?", [nowIso(), id]);
}
