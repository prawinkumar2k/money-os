import { Response } from "express";
import { z } from "zod";
import { Goal } from "../models/Goal";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const createGoalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  targetDate: z.coerce.date().nullable().optional(),
});

const updateGoalSchema = z.object({
  name: z.string().min(1).optional(),
  targetAmount: z.number().positive().optional(),
  targetDate: z.coerce.date().nullable().optional(),
});

const contributionSchema = z.object({
  amount: z.number().refine((n) => n !== 0, { message: "Amount cannot be zero" }),
  note: z.string().nullable().optional(),
});

const MS_PER_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000;

function withComputedFields(goal: InstanceType<typeof Goal>) {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const progressPercentage = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;

  let requiredMonthlyContribution: number | null = null;
  if (goal.targetDate && remaining > 0) {
    const monthsRemaining = (goal.targetDate.getTime() - Date.now()) / MS_PER_MONTH;
    requiredMonthlyContribution = monthsRemaining > 0 ? remaining / monthsRemaining : null;
  }

  return {
    ...goal.toObject(),
    remaining,
    progressPercentage,
    requiredMonthlyContribution,
  };
}

export const listGoals = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const goals = await Goal.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ goals: goals.map(withComputedFields) });
});

export const getGoal = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const goal = await Goal.findOne({ _id: req.params.id, userId: req.userId });
  if (!goal) throw new HttpError(404, "Goal not found");
  res.json({ goal: withComputedFields(goal) });
});

export const createGoal = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createGoalSchema.parse(req.body);
  const goal = await Goal.create({ ...body, userId: req.userId, currentAmount: 0, contributions: [] });
  res.status(201).json({ goal: withComputedFields(goal) });
});

export const updateGoal = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = updateGoalSchema.parse(req.body);
  const goal = await Goal.findOne({ _id: req.params.id, userId: req.userId });
  if (!goal) throw new HttpError(404, "Goal not found");

  Object.assign(goal, body);
  await goal.save();

  res.json({ goal: withComputedFields(goal) });
});

export const deleteGoal = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const goal = await Goal.findOne({ _id: req.params.id, userId: req.userId });
  if (!goal) throw new HttpError(404, "Goal not found");
  await goal.deleteOne();
  res.status(204).send();
});

export const addContribution = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = contributionSchema.parse(req.body);
  const goal = await Goal.findOne({ _id: req.params.id, userId: req.userId });
  if (!goal) throw new HttpError(404, "Goal not found");

  goal.contributions.push({ amount: body.amount, date: new Date(), note: body.note ?? null });
  goal.currentAmount = Math.max(0, goal.currentAmount + body.amount);
  await goal.save();

  res.status(201).json({ goal: withComputedFields(goal) });
});
