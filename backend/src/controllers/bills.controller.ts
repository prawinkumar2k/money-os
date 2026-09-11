import { Response } from "express";
import { z } from "zod";
import { Bill, BillFrequency } from "../models/Bill";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { createExpenseTransaction } from "../services/transaction.service";
import { Account } from "../models/Account";

const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;

const createBillSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  accountId: z.string().min(1),
  category: z.string().nullable().optional(),
  frequency: z.enum(FREQUENCIES),
  dueDate: z.coerce.date(),
  reminderDaysBefore: z.number().int().min(0).default(3),
  active: z.boolean().default(true),
});

const updateBillSchema = createBillSchema.partial();

function advanceDueDate(date: Date, frequency: BillFrequency): Date {
  const next = new Date(date);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

function withComputedFields(bill: InstanceType<typeof Bill>) {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.ceil((bill.dueDate.getTime() - now.getTime()) / msPerDay);

  let status: "overdue" | "due_soon" | "upcoming";
  if (daysUntilDue < 0) status = "overdue";
  else if (daysUntilDue <= bill.reminderDaysBefore) status = "due_soon";
  else status = "upcoming";

  return { ...bill.toObject(), daysUntilDue, status };
}

export const listBills = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const bills = await Bill.find({ userId: req.userId }).sort({ dueDate: 1 });
  res.json({ bills: bills.map(withComputedFields) });
});

export const getBill = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, userId: req.userId });
  if (!bill) throw new HttpError(404, "Bill not found");
  res.json({ bill: withComputedFields(bill) });
});

async function requireOwnAccount(userId: string, accountId: string) {
  const account = await Account.findOne({ _id: accountId, userId });
  if (!account) throw new HttpError(404, "Account not found");
}

export const createBill = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createBillSchema.parse(req.body);
  await requireOwnAccount(req.userId!, body.accountId);

  const bill = await Bill.create({ ...body, userId: req.userId });
  res.status(201).json({ bill: withComputedFields(bill) });
});

export const updateBill = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = updateBillSchema.parse(req.body);
  const bill = await Bill.findOne({ _id: req.params.id, userId: req.userId });
  if (!bill) throw new HttpError(404, "Bill not found");

  if (body.accountId) await requireOwnAccount(req.userId!, body.accountId);

  Object.assign(bill, body);
  await bill.save();

  res.json({ bill: withComputedFields(bill) });
});

export const deleteBill = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, userId: req.userId });
  if (!bill) throw new HttpError(404, "Bill not found");
  await bill.deleteOne();
  res.status(204).send();
});

export const payBill = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, userId: req.userId });
  if (!bill) throw new HttpError(404, "Bill not found");

  const transaction = await createExpenseTransaction({
    userId: req.userId!,
    accountId: String(bill.accountId),
    amount: bill.amount,
    date: new Date(),
    description: `${bill.name} (bill payment)`,
    category: bill.category,
  });

  bill.lastPaidDate = new Date();
  bill.dueDate = advanceDueDate(bill.dueDate, bill.frequency);
  await bill.save();

  res.status(201).json({ bill: withComputedFields(bill), transaction });
});
