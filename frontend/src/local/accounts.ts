import { getDb, genId, nowIso } from "./db";
import type { Account, CreateAccountInput } from "../api/accounts";

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    _id: row.id as string,
    name: row.name as string,
    institution: row.institution as string,
    type: row.type as string,
    balance: row.balance as number,
    availableBalance: (row.availableBalance as number | null) ?? null,
    creditLimit: (row.creditLimit as number | null) ?? null,
    currency: row.currency as string,
    provider: "manual",
    isMockData: false,
    lastSyncedAt: null,
  };
}

export async function listAccountsLocal(): Promise<Account[]> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM accounts WHERE deletedAt IS NULL ORDER BY createdAt DESC");
  return (res.values ?? []).map(rowToAccount);
}

export async function createAccountLocal(input: CreateAccountInput): Promise<Account> {
  const db = await getDb();
  const id = genId();
  const now = nowIso();
  await db.run(
    "INSERT INTO accounts (id, name, institution, type, balance, availableBalance, creditLimit, currency, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, input.name, input.institution, input.type, input.balance, input.balance, null, "INR", now, now]
  );
  return {
    _id: id,
    name: input.name,
    institution: input.institution,
    type: input.type,
    balance: input.balance,
    availableBalance: input.balance,
    creditLimit: null,
    currency: "INR",
    provider: "manual",
    isMockData: false,
    lastSyncedAt: null,
  };
}

export async function deleteAccountLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE accounts SET deletedAt = ? WHERE id = ?", [nowIso(), id]);
}

export async function getAccountByIdLocal(id: string): Promise<Account | null> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM accounts WHERE id = ? AND deletedAt IS NULL", [id]);
  const row = res.values?.[0];
  return row ? rowToAccount(row) : null;
}

export async function applyBalanceDeltaLocal(accountId: string, delta: number): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE accounts SET balance = balance + ?, availableBalance = COALESCE(availableBalance, 0) + ?, updatedAt = ? WHERE id = ?", [
    delta,
    delta,
    nowIso(),
    accountId,
  ]);
}
