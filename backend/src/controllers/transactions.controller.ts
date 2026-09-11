import { Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { categorize } from "../services/categorization.service";
import { applyBalanceDelta } from "../services/transaction.service";

const TRANSACTION_TYPES = [
  "expense",
  "income",
  "transfer",
  "refund",
  "investment",
  "loan_payment",
  "credit_card_payment",
  "interest",
  "cashback",
  "fee",
  "adjustment",
] as const;

const baseFields = {
  date: z.coerce.date(),
  description: z.string().min(1),
  merchant: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
};

const createSingleLegSchema = z.object({
  ...baseFields,
  type: z.enum(TRANSACTION_TYPES).refine((t) => t !== "transfer", { message: "Use fromAccountId/toAccountId for transfers" }),
  accountId: z.string().min(1),
  amount: z.number().refine((n) => n !== 0, { message: "Amount cannot be zero" }),
});

const createTransferSchema = z.object({
  ...baseFields,
  type: z.literal("transfer"),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().positive(),
});

const createTransactionSchema = z.union([createTransferSchema, createSingleLegSchema]);

const updateTransactionSchema = z.object({
  date: z.coerce.date().optional(),
  description: z.string().min(1).optional(),
  merchant: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  amount: z.number().refine((n) => n !== 0, { message: "Amount cannot be zero" }).optional(),
  accountId: z.string().min(1).optional(),
  rememberRule: z.boolean().optional(),
});

// A data: URL, e.g. "data:image/jpeg;base64,/9j/4AAQ...". Capped at ~2.2MB of binary data
// (base64 is ~4/3 the size) to keep documents well under MongoDB's 16MB limit; the mime-type
// allowlist stops anything other than a real image (e.g. "data:text/html") from being stored
// and later rendered back as an <img src>.
const receiptImageSchema = z.object({
  image: z
    .string()
    .max(3_000_000, "Receipt image is too large")
    .regex(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Must be a base64-encoded JPEG, PNG, or WebP image"),
});

const listQuerySchema = z.object({
  accountId: z.string().optional(),
  category: z.string().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requireOwnAccount(userId: string, accountId: string) {
  const account = await Account.findOne({ _id: accountId, userId });
  if (!account) throw new HttpError(404, "Account not found");
  return account;
}

export const listTransactions = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const query = listQuerySchema.parse(req.query);

  const filter: Record<string, unknown> = { userId: req.userId };
  if (query.accountId) filter.accountId = query.accountId;
  if (query.category) filter.category = query.category;
  if (query.type) filter.type = query.type;
  if (query.dateFrom || query.dateTo) {
    filter.date = {
      ...(query.dateFrom ? { $gte: query.dateFrom } : {}),
      ...(query.dateTo ? { $lte: query.dateTo } : {}),
    };
  }
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ description: pattern }, { merchant: pattern }];
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ date: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Transaction.countDocuments(filter),
  ]);

  res.json({ transactions, pagination: { page: query.page, limit: query.limit, total } });
});

export const getTransaction = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.userId });
  if (!transaction) throw new HttpError(404, "Transaction not found");
  res.json({ transaction });
});

export const createTransaction = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createTransactionSchema.parse(req.body);
  const userId = req.userId!;

  if (body.type === "transfer") {
    if (body.fromAccountId === body.toAccountId) {
      throw new HttpError(400, "fromAccountId and toAccountId must be different accounts");
    }
    await requireOwnAccount(userId, body.fromAccountId);
    await requireOwnAccount(userId, body.toAccountId);

    const transferGroupId = uuidv4();
    const shared = {
      userId,
      date: body.date,
      description: body.description,
      merchant: body.merchant ?? null,
      category: body.category ?? "Transfer",
      subcategory: body.subcategory ?? null,
      notes: body.notes ?? null,
      tags: body.tags ?? [],
      type: "transfer" as const,
      provider: "manual",
      isMockData: false,
      source: "manual" as const,
      transferGroupId,
    };

    const [outLeg, inLeg] = await Transaction.create([
      { ...shared, accountId: body.fromAccountId, amount: -body.amount },
      { ...shared, accountId: body.toAccountId, amount: body.amount },
    ]);

    await applyBalanceDelta(userId, body.fromAccountId, -body.amount);
    await applyBalanceDelta(userId, body.toAccountId, body.amount);

    return res.status(201).json({ transactions: [outLeg, inLeg] });
  }

  await requireOwnAccount(userId, body.accountId);

  const category = body.category ?? (await categorize(userId, body.merchant ?? null, body.description));

  const transaction = await Transaction.create({
    userId,
    accountId: body.accountId,
    amount: body.amount,
    date: body.date,
    description: body.description,
    merchant: body.merchant ?? null,
    category,
    subcategory: body.subcategory ?? null,
    notes: body.notes ?? null,
    tags: body.tags ?? [],
    type: body.type,
    provider: "manual",
    isMockData: false,
    source: "manual",
  });

  await applyBalanceDelta(userId, body.accountId, body.amount);

  res.status(201).json({ transaction });
});

export const updateTransaction = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = updateTransactionSchema.parse(req.body);
  const userId = req.userId!;

  const transaction = await Transaction.findOne({ _id: req.params.id, userId });
  if (!transaction) throw new HttpError(404, "Transaction not found");

  if (transaction.transferGroupId && (body.amount !== undefined || body.accountId !== undefined)) {
    throw new HttpError(409, "Delete and recreate the transfer to change its amount or accounts");
  }

  const newAccountId = body.accountId ?? String(transaction.accountId);
  if (body.accountId) {
    await requireOwnAccount(userId, body.accountId);
  }

  const oldAmount = transaction.amount;
  const oldAccountId = String(transaction.accountId);
  const newAmount = body.amount ?? oldAmount;

  if (body.amount !== undefined || body.accountId !== undefined) {
    await applyBalanceDelta(userId, oldAccountId, -oldAmount);
    await applyBalanceDelta(userId, newAccountId, newAmount);
  }

  if (body.date !== undefined) transaction.date = body.date;
  if (body.description !== undefined) transaction.description = body.description;
  if (body.merchant !== undefined) transaction.merchant = body.merchant;
  if (body.category !== undefined) transaction.category = body.category;
  if (body.subcategory !== undefined) transaction.subcategory = body.subcategory;
  if (body.notes !== undefined) transaction.notes = body.notes;
  if (body.tags !== undefined) transaction.tags = body.tags;
  if (body.amount !== undefined) transaction.amount = body.amount;
  if (body.accountId !== undefined) transaction.accountId = body.accountId as unknown as typeof transaction.accountId;

  await transaction.save();

  if (body.rememberRule && body.category && transaction.merchant) {
    await Category.updateOne(
      { userId, name: body.category },
      { $addToSet: { merchantRules: transaction.merchant }, $setOnInsert: { userId, name: body.category, isSystem: false } },
      { upsert: true }
    );
  }

  res.json({ transaction });
});

export const setTransactionReceipt = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = receiptImageSchema.parse(req.body);
  const transaction = await Transaction.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { receiptImage: body.image },
    { new: true }
  );
  if (!transaction) throw new HttpError(404, "Transaction not found");
  res.json({ transaction });
});

export const deleteTransactionReceipt = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const transaction = await Transaction.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { receiptImage: null },
    { new: true }
  );
  if (!transaction) throw new HttpError(404, "Transaction not found");
  res.json({ transaction });
});

export const deleteTransaction = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const transaction = await Transaction.findOne({ _id: req.params.id, userId });
  if (!transaction) throw new HttpError(404, "Transaction not found");

  if (transaction.transferGroupId) {
    const legs = await Transaction.find({ transferGroupId: transaction.transferGroupId, userId });
    for (const leg of legs) {
      await applyBalanceDelta(userId, String(leg.accountId), -leg.amount);
    }
    await Transaction.deleteMany({ transferGroupId: transaction.transferGroupId, userId });
  } else {
    await applyBalanceDelta(userId, String(transaction.accountId), -transaction.amount);
    await transaction.deleteOne();
  }

  res.status(204).send();
});
