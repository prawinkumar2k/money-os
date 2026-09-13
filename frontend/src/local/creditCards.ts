import { getDb, genId, nowIso } from "./db";
import { applyBalanceDeltaLocal } from "./accounts";
import type { CreditCard, CreateCreditCardInput } from "../api/creditCards";

async function withComputedFields(db: Awaited<ReturnType<typeof getDb>>, row: Record<string, unknown>): Promise<CreditCard> {
  const accountRes = await db.query("SELECT name, creditLimit, balance FROM accounts WHERE id = ?", [row.accountId]);
  const account = accountRes.values?.[0];
  const creditLimit = account?.creditLimit ?? 0;
  const outstanding = account ? Math.max(0, -account.balance) : 0;
  const availableCredit = Math.max(0, creditLimit - outstanding);
  const utilizationPercent = creditLimit > 0 ? Math.round((outstanding / creditLimit) * 1000) / 10 : 0;
  const minimumDue = Math.round(outstanding * ((row.minimumDuePercent as number) / 100) * 100) / 100;

  const now = new Date();
  const daysUntilDue = Math.ceil((new Date(row.dueDate as string).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  return {
    _id: row.id as string,
    accountId: row.accountId as string,
    accountName: account?.name ?? null,
    statementDay: row.statementDay as number,
    dueDate: row.dueDate as string,
    minimumDuePercent: row.minimumDuePercent as number,
    creditLimit,
    outstanding,
    availableCredit,
    utilizationPercent,
    minimumDue,
    daysUntilDue,
    highUtilization: utilizationPercent >= 75,
  };
}

export async function listCreditCardsLocal(): Promise<CreditCard[]> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM credit_cards WHERE deletedAt IS NULL ORDER BY createdAt DESC");
  return Promise.all((res.values ?? []).map((row) => withComputedFields(db, row)));
}

export async function createCreditCardLocal(input: CreateCreditCardInput): Promise<CreditCard> {
  const db = await getDb();
  const existing = await db.query("SELECT id FROM credit_cards WHERE accountId = ? AND deletedAt IS NULL", [input.accountId]);
  if (existing.values?.length) throw new Error("This account is already linked to a credit card record");

  const id = genId();
  const now = nowIso();
  await db.run("INSERT INTO credit_cards (id, accountId, statementDay, dueDate, minimumDuePercent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    id,
    input.accountId,
    input.statementDay,
    input.dueDate,
    input.minimumDuePercent ?? 5,
    now,
    now,
  ]);
  const res = await db.query("SELECT * FROM credit_cards WHERE id = ?", [id]);
  return withComputedFields(db, res.values![0]);
}

export async function deleteCreditCardLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE credit_cards SET deletedAt = ? WHERE id = ?", [nowIso(), id]);
}

export async function payCreditCardLocal(id: string, fromAccountId: string, amount: number): Promise<CreditCard> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM credit_cards WHERE id = ?", [id]);
  const card = res.values?.[0];
  if (!card) throw new Error("Credit card not found");

  const now = nowIso();
  const transferGroupId = genId();
  await db.run(
    `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
     VALUES (?, ?, ?, 'INR', ?, 'Credit card payment', NULL, NULL, NULL, 'credit_card_payment', NULL, '[]', ?, ?, ?)`,
    [genId(), fromAccountId, -amount, now, transferGroupId, now, now]
  );
  await db.run(
    `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
     VALUES (?, ?, ?, 'INR', ?, 'Credit card payment', NULL, NULL, NULL, 'credit_card_payment', NULL, '[]', ?, ?, ?)`,
    [genId(), card.accountId, amount, now, transferGroupId, now, now]
  );
  await applyBalanceDeltaLocal(fromAccountId, -amount);
  await applyBalanceDeltaLocal(card.accountId, amount);

  return withComputedFields(db, card);
}
