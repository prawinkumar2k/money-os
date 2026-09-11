import { randomUUID } from "crypto";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Category } from "../models/Category";
import { Budget } from "../models/Budget";
import { Goal } from "../models/Goal";
import { Bill } from "../models/Bill";
import { Subscription } from "../models/Subscription";
import { CreditCard } from "../models/CreditCard";
import { Loan } from "../models/Loan";
import { Investment } from "../models/Investment";
import { User } from "../models/User";

export const BACKUP_VERSION = 1;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  userEmail: string;
  data: {
    accounts: unknown[];
    transactions: unknown[];
    categories: unknown[];
    budgets: unknown[];
    goals: unknown[];
    bills: unknown[];
    subscriptions: unknown[];
    creditCards: unknown[];
    loans: unknown[];
    investments: unknown[];
  };
}

export async function buildBackup(userId: string): Promise<BackupPayload> {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const [accounts, transactions, categories, budgets, goals, bills, subscriptions, creditCards, loans, investments] =
    await Promise.all([
      Account.find({ userId }).lean(),
      Transaction.find({ userId }).lean(),
      Category.find({ userId }).lean(), // user-defined categories only — system categories are re-seeded on any install
      Budget.find({ userId }).lean(),
      Goal.find({ userId }).lean(),
      Bill.find({ userId }).lean(),
      Subscription.find({ userId }).lean(),
      CreditCard.find({ userId }).lean(),
      Loan.find({ userId }).lean(),
      Investment.find({ userId }).lean(),
    ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    userEmail: user.email,
    data: { accounts, transactions, categories, budgets, goals, bills, subscriptions, creditCards, loans, investments },
  };
}

export function validateBackupShape(payload: unknown): payload is BackupPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.version !== "number" || p.version > BACKUP_VERSION) return false;
  if (!p.data || typeof p.data !== "object") return false;
  const requiredKeys = [
    "accounts",
    "transactions",
    "categories",
    "budgets",
    "goals",
    "bills",
    "subscriptions",
    "creditCards",
    "loans",
    "investments",
  ];
  return requiredKeys.every((k) => Array.isArray((p.data as Record<string, unknown>)[k]));
}

/**
 * Restores a backup into the CURRENT user's account, remapping every foreign key (old _id ->
 * newly-inserted _id) so restoring never collides with or overwrites another user's data — even
 * a backup restored into a different account than the one it came from stays self-consistent.
 */
export async function restoreBackup(userId: string, payload: BackupPayload): Promise<{ restoredCounts: Record<string, number> }> {
  const accountIdMap = new Map<string, string>();
  const restoredCounts: Record<string, number> = {};

  for (const raw of payload.data.accounts) {
    const a = raw as Record<string, unknown>;
    const oldId = String(a._id);
    const created = await Account.create({ ...a, _id: undefined, userId });
    accountIdMap.set(oldId, String(created._id));
  }
  restoredCounts.accounts = accountIdMap.size;

  let transactionCount = 0;
  const transferGroupMap = new Map<string, string>();
  for (const raw of payload.data.transactions) {
    const t = raw as Record<string, unknown>;
    const newAccountId = accountIdMap.get(String(t.accountId));
    if (!newAccountId) continue; // orphaned reference — skip rather than corrupt data

    let transferGroupId = t.transferGroupId as string | null;
    if (transferGroupId) {
      if (!transferGroupMap.has(transferGroupId)) transferGroupMap.set(transferGroupId, randomUUID());
      transferGroupId = transferGroupMap.get(transferGroupId)!;
    }

    await Transaction.create({ ...t, _id: undefined, userId, accountId: newAccountId, transferGroupId });
    transactionCount += 1;
  }
  restoredCounts.transactions = transactionCount;

  for (const collectionName of ["categories", "budgets", "goals", "bills", "subscriptions", "creditCards", "loans", "investments"] as const) {
    const Model = { categories: Category, budgets: Budget, goals: Goal, bills: Bill, subscriptions: Subscription, creditCards: CreditCard, loans: Loan, investments: Investment }[collectionName];
    let count = 0;
    for (const raw of payload.data[collectionName]) {
      const doc = raw as Record<string, unknown>;
      const patch: Record<string, unknown> = { ...doc, _id: undefined, userId };
      if ("accountId" in doc && doc.accountId) {
        const mapped = accountIdMap.get(String(doc.accountId));
        if (!mapped) continue;
        patch.accountId = mapped;
      }
      await (Model.create as (doc: Record<string, unknown>) => Promise<unknown>)(patch);
      count += 1;
    }
    restoredCounts[collectionName] = count;
  }

  return { restoredCounts };
}
