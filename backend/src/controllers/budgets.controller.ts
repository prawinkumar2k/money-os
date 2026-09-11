import { Response } from "express";
import { z } from "zod";
import { Budget } from "../models/Budget";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import {
  computeAlertLevel,
  computeSpent,
  getCurrentPeriodRange,
  getPreviousPeriodRange,
} from "../services/budget.service";

const createBudgetSchema = z.object({
  category: z.string().nullable().default(null),
  amount: z.number().positive(),
  period: z.enum(["weekly", "monthly"]),
  rollover: z.boolean().default(false),
});

const updateBudgetSchema = createBudgetSchema.partial();

async function withComputedFields(budget: InstanceType<typeof Budget>) {
  const currentRange = getCurrentPeriodRange(budget.period);
  const spent = await computeSpent(String(budget.userId), budget.category, currentRange);

  let effectiveLimit = budget.amount;
  if (budget.rollover) {
    const previousRange = getPreviousPeriodRange(budget.period, currentRange);
    const previousSpent = await computeSpent(String(budget.userId), budget.category, previousRange);
    effectiveLimit += Math.max(0, budget.amount - previousSpent);
  }

  const remaining = effectiveLimit - spent;
  const percentageUsed = effectiveLimit > 0 ? Math.round((spent / effectiveLimit) * 100) : 0;

  return {
    ...budget.toObject(),
    periodStart: currentRange.start,
    periodEnd: currentRange.end,
    spent,
    effectiveLimit,
    remaining,
    percentageUsed,
    alertLevel: computeAlertLevel(percentageUsed),
  };
}

export const listBudgets = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const budgets = await Budget.find({ userId: req.userId }).sort({ createdAt: -1 });
  const withFields = await Promise.all(budgets.map(withComputedFields));
  res.json({ budgets: withFields });
});

export const getBudget = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const budget = await Budget.findOne({ _id: req.params.id, userId: req.userId });
  if (!budget) throw new HttpError(404, "Budget not found");
  res.json({ budget: await withComputedFields(budget) });
});

export const createBudget = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createBudgetSchema.parse(req.body);
  const budget = await Budget.create({ ...body, userId: req.userId });
  res.status(201).json({ budget: await withComputedFields(budget) });
});

export const updateBudget = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = updateBudgetSchema.parse(req.body);
  const budget = await Budget.findOne({ _id: req.params.id, userId: req.userId });
  if (!budget) throw new HttpError(404, "Budget not found");

  Object.assign(budget, body);
  await budget.save();

  res.json({ budget: await withComputedFields(budget) });
});

export const deleteBudget = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const budget = await Budget.findOne({ _id: req.params.id, userId: req.userId });
  if (!budget) throw new HttpError(404, "Budget not found");
  await budget.deleteOne();
  res.status(204).send();
});
