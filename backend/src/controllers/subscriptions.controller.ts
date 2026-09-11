import { Response } from "express";
import { z } from "zod";
import { Subscription } from "../models/Subscription";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { detectRecurringPayments } from "../services/subscriptionDetection.service";

const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;

const confirmSchema = z.object({
  merchant: z.string().min(1),
  name: z.string().min(1),
  amount: z.number().positive(),
  frequency: z.enum(FREQUENCIES),
});

function costs(amount: number, frequency: (typeof FREQUENCIES)[number]) {
  const monthlyCost = frequency === "weekly" ? amount * (30 / 7) : frequency === "monthly" ? amount : amount / 12;
  return { monthlyCost: Math.round(monthlyCost * 100) / 100, yearlyCost: Math.round(monthlyCost * 12 * 100) / 100 };
}

export const listDetectedSubscriptions = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const candidates = await detectRecurringPayments(req.userId!);
  const existing = await Subscription.find({ userId: req.userId }).select("merchant");
  const known = new Set(existing.map((s) => s.merchant));

  const detected = candidates.filter((c) => !known.has(c.merchant));
  res.json({ detected });
});

export const listSubscriptions = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const subscriptions = await Subscription.find({ userId: req.userId, status: { $ne: "dismissed" } }).sort({
    createdAt: -1,
  });

  const active = subscriptions.filter((s) => s.status === "confirmed");
  const totalMonthlyCost = active.reduce((sum, s) => sum + s.monthlyCost, 0);
  const totalYearlyCost = active.reduce((sum, s) => sum + s.yearlyCost, 0);

  res.json({ subscriptions, totalMonthlyCost, totalYearlyCost });
});

export const confirmSubscription = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = confirmSchema.parse(req.body);
  const { monthlyCost, yearlyCost } = costs(body.amount, body.frequency);

  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.userId, merchant: body.merchant },
    {
      $set: {
        userId: req.userId,
        merchant: body.merchant,
        name: body.name,
        amount: body.amount,
        frequency: body.frequency,
        monthlyCost,
        yearlyCost,
        status: "confirmed",
        confirmedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ subscription });
});

export const dismissSubscription = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = z.object({ merchant: z.string().min(1), name: z.string().min(1) }).parse(req.body);

  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.userId, merchant: body.merchant },
    {
      $set: { userId: req.userId, merchant: body.merchant, name: body.name, status: "dismissed" },
      $setOnInsert: { amount: 0, frequency: "monthly", monthlyCost: 0, yearlyCost: 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ subscription });
});

export const cancelSubscription = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const subscription = await Subscription.findOne({ _id: req.params.id, userId: req.userId });
  if (!subscription) throw new HttpError(404, "Subscription not found");

  subscription.status = "cancelled";
  await subscription.save();

  res.json({ subscription });
});
