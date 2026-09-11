import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";

// userId is required (not just accountId) as defense-in-depth: every current caller has already
// verified the account belongs to the requesting user, but scoping the update itself means a
// future call site that forgets that check still can't silently mutate another user's balance.
export async function applyBalanceDelta(userId: string, accountId: string, delta: number): Promise<void> {
  await Account.updateOne(
    { _id: accountId, userId },
    { $inc: { balance: delta, ...(delta !== 0 ? { availableBalance: delta } : {}) } }
  );
}

export interface CreateExpenseInput {
  userId: string;
  accountId: string;
  amount: number; // positive magnitude; stored as a negative (outflow) amount
  date: Date;
  description: string;
  category: string | null;
  type?: "expense" | "loan_payment" | "credit_card_payment" | "fee";
}

/**
 * Creates a real outflow transaction (expense by default) and updates the paying account's
 * balance — used by "mark bill as paid" / "pay loan installment" so a payment is an actual
 * transaction, not a status flag.
 */
export async function createExpenseTransaction(input: CreateExpenseInput) {
  const amount = -Math.abs(input.amount);

  const transaction = await Transaction.create({
    userId: input.userId,
    accountId: input.accountId,
    amount,
    date: input.date,
    description: input.description,
    category: input.category,
    type: input.type ?? "expense",
    provider: "manual",
    isMockData: false,
    source: "manual",
  });

  await applyBalanceDelta(input.userId, input.accountId, amount);

  return transaction;
}
