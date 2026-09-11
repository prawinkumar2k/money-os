import { Response } from "express";
import { z } from "zod";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const ACCOUNT_TYPES = [
  "savings",
  "current",
  "salary",
  "credit_card",
  "cash",
  "upi",
  "investment",
  "loan",
  "fixed_deposit",
  "recurring_deposit",
  "custom",
] as const;

const createAccountSchema = z.object({
  name: z.string().min(1),
  institution: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().default("INR"),
  balance: z.number().default(0),
  creditLimit: z.number().nullable().optional(),
  maskedAccountNumber: z.string().nullable().optional(),
  ifsc: z.string().nullable().optional(),
});

const updateAccountSchema = createAccountSchema.partial();

export const listAccounts = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const accounts = await Account.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ accounts });
});

export const getAccount = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const account = await Account.findOne({ _id: req.params.id, userId: req.userId });
  if (!account) throw new HttpError(404, "Account not found");
  res.json({ account });
});

export const createAccount = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createAccountSchema.parse(req.body);

  const account = await Account.create({
    ...body,
    userId: req.userId,
    provider: "manual",
    isMockData: false,
    availableBalance: body.balance,
  });

  res.status(201).json({ account });
});

export const updateAccount = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = updateAccountSchema.parse(req.body);

  const account = await Account.findOne({ _id: req.params.id, userId: req.userId });
  if (!account) throw new HttpError(404, "Account not found");

  // Provider-sourced accounts only change via sync — editing them here would silently diverge
  // from what the bank/provider actually reports.
  if (account.provider !== "manual") {
    throw new HttpError(409, "This account is managed by a connected provider and cannot be edited manually");
  }

  Object.assign(account, body);
  await account.save();

  res.json({ account });
});

export const deleteAccount = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const account = await Account.findOne({ _id: req.params.id, userId: req.userId });
  if (!account) throw new HttpError(404, "Account not found");

  await Transaction.deleteMany({ accountId: account._id, userId: req.userId });
  await account.deleteOne();

  res.status(204).send();
});
