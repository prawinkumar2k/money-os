import { Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { CreditCard } from "../models/CreditCard";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { applyBalanceDelta } from "../services/transaction.service";

const createSchema = z.object({
  accountId: z.string().min(1),
  statementDay: z.number().int().min(1).max(31),
  dueDate: z.coerce.date(),
  minimumDuePercent: z.number().min(0).max(100).default(5),
});

const updateSchema = createSchema.partial().omit({ accountId: true });

const paySchema = z.object({
  fromAccountId: z.string().min(1),
  amount: z.number().positive(),
});

async function requireOwnCreditCardAccount(userId: string, accountId: string) {
  const account = await Account.findOne({ _id: accountId, userId, type: "credit_card" });
  if (!account) throw new HttpError(404, "Credit card account not found");
  return account;
}

async function withComputedFields(card: InstanceType<typeof CreditCard>) {
  const account = await Account.findById(card.accountId);
  const creditLimit = account?.creditLimit ?? 0;
  const outstanding = account ? Math.max(0, -account.balance) : 0;
  const availableCredit = Math.max(0, creditLimit - outstanding);
  const utilizationPercent = creditLimit > 0 ? Math.round((outstanding / creditLimit) * 1000) / 10 : 0;
  const minimumDue = Math.round(outstanding * (card.minimumDuePercent / 100) * 100) / 100;

  const now = new Date();
  const daysUntilDue = Math.ceil((card.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  return {
    ...card.toObject(),
    accountName: account?.name ?? null,
    creditLimit,
    outstanding,
    availableCredit,
    utilizationPercent,
    minimumDue,
    daysUntilDue,
    highUtilization: utilizationPercent >= 75,
  };
}

export const listCreditCards = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const cards = await CreditCard.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ creditCards: await Promise.all(cards.map(withComputedFields)) });
});

export const getCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const card = await CreditCard.findOne({ _id: req.params.id, userId: req.userId });
  if (!card) throw new HttpError(404, "Credit card not found");
  res.json({ creditCard: await withComputedFields(card) });
});

export const createCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createSchema.parse(req.body);
  await requireOwnCreditCardAccount(req.userId!, body.accountId);

  const existing = await CreditCard.findOne({ accountId: body.accountId });
  if (existing) throw new HttpError(409, "This account is already linked to a credit card record");

  const card = await CreditCard.create({ ...body, userId: req.userId });
  res.status(201).json({ creditCard: await withComputedFields(card) });
});

export const updateCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = updateSchema.parse(req.body);
  const card = await CreditCard.findOne({ _id: req.params.id, userId: req.userId });
  if (!card) throw new HttpError(404, "Credit card not found");

  Object.assign(card, body);
  await card.save();

  res.json({ creditCard: await withComputedFields(card) });
});

export const deleteCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const card = await CreditCard.findOne({ _id: req.params.id, userId: req.userId });
  if (!card) throw new HttpError(404, "Credit card not found");
  await card.deleteOne();
  res.status(204).send();
});

// Paying a credit card moves real money: it debits the paying account and reduces the card's
// outstanding balance (credits the card account toward zero) — two linked transaction legs,
// same pattern as an account-to-account transfer, so it is never double-counted as a plain expense.
export const payCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = paySchema.parse(req.body);
  const card = await CreditCard.findOne({ _id: req.params.id, userId: req.userId });
  if (!card) throw new HttpError(404, "Credit card not found");

  const fromAccount = await Account.findOne({ _id: body.fromAccountId, userId: req.userId });
  if (!fromAccount) throw new HttpError(404, "Paying account not found");

  const transferGroupId = uuidv4();
  const now = new Date();
  const shared = {
    userId: req.userId,
    date: now,
    description: "Credit card payment",
    type: "credit_card_payment" as const,
    provider: "manual",
    isMockData: false,
    source: "manual" as const,
    transferGroupId,
  };

  const [outLeg, inLeg] = await Transaction.create([
    { ...shared, accountId: body.fromAccountId, amount: -body.amount },
    { ...shared, accountId: card.accountId, amount: body.amount },
  ]);

  await applyBalanceDelta(req.userId!, body.fromAccountId, -body.amount);
  await applyBalanceDelta(req.userId!, String(card.accountId), body.amount);

  res.status(201).json({ creditCard: await withComputedFields(card), transactions: [outLeg, inLeg] });
});
