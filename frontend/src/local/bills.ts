import { getDb, genId, nowIso } from "./db";
import { applyBalanceDeltaLocal } from "./accounts";
import type { Bill, CreateBillInput } from "../api/bills";

function advanceDueDate(date: Date, frequency: "weekly" | "monthly" | "yearly"): Date {
  const next = new Date(date);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

function withComputedFields(row: Record<string, unknown>): Bill {
  const dueDate = row.dueDate as string;
  const reminderDaysBefore = row.reminderDaysBefore as number;
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.ceil((new Date(dueDate).getTime() - now.getTime()) / msPerDay);

  let status: "overdue" | "due_soon" | "upcoming";
  if (daysUntilDue < 0) status = "overdue";
  else if (daysUntilDue <= reminderDaysBefore) status = "due_soon";
  else status = "upcoming";

  return {
    _id: row.id as string,
    name: row.name as string,
    amount: row.amount as number,
    accountId: row.accountId as string,
    category: (row.category as string | null) ?? null,
    frequency: row.frequency as "weekly" | "monthly" | "yearly",
    dueDate,
    reminderDaysBefore,
    active: !!row.active,
    lastPaidDate: (row.lastPaidDate as string | null) ?? null,
    daysUntilDue,
    status,
  };
}

export async function listBillsLocal(): Promise<Bill[]> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM bills WHERE deletedAt IS NULL ORDER BY dueDate ASC");
  return (res.values ?? []).map(withComputedFields);
}

export async function createBillLocal(input: CreateBillInput): Promise<Bill> {
  const db = await getDb();
  const id = genId();
  const now = nowIso();
  await db.run(
    `INSERT INTO bills (id, name, amount, accountId, category, frequency, dueDate, reminderDaysBefore, active, lastPaidDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
    [id, input.name, input.amount, input.accountId, input.category ?? null, input.frequency, input.dueDate, input.reminderDaysBefore ?? 3, now, now]
  );
  const res = await db.query("SELECT * FROM bills WHERE id = ?", [id]);
  return withComputedFields(res.values![0]);
}

export async function deleteBillLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE bills SET deletedAt = ? WHERE id = ?", [nowIso(), id]);
}

export async function payBillLocal(id: string): Promise<Bill> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM bills WHERE id = ?", [id]);
  const bill = res.values?.[0];
  if (!bill) throw new Error("Bill not found");

  const now = nowIso();
  const txnId = genId();
  await db.run(
    `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
     VALUES (?, ?, ?, 'INR', ?, ?, NULL, ?, NULL, 'expense', NULL, '[]', NULL, ?, ?)`,
    [txnId, bill.accountId, -Math.abs(bill.amount), now, `${bill.name} (bill payment)`, bill.category ?? null, now, now]
  );
  await applyBalanceDeltaLocal(bill.accountId, -Math.abs(bill.amount));

  const nextDueDate = advanceDueDate(new Date(bill.dueDate), bill.frequency);
  await db.run("UPDATE bills SET lastPaidDate = ?, dueDate = ?, updatedAt = ? WHERE id = ?", [now, nextDueDate.toISOString(), now, id]);

  const updated = await db.query("SELECT * FROM bills WHERE id = ?", [id]);
  return withComputedFields(updated.values![0]);
}
