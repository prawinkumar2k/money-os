import { Response } from "express";
import { z } from "zod";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";
import { computeNetWorth, recordSnapshot } from "../services/netWorth.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";

async function findClosestSnapshot(userId: string, targetDate: Date) {
  return NetWorthSnapshot.findOne({ userId, date: { $lte: targetDate } }).sort({ date: -1 });
}

export const getNetWorth = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const current = await computeNetWorth(userId);
  await recordSnapshot(userId);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const [monthAgoSnapshot, yearAgoSnapshot] = await Promise.all([
    findClosestSnapshot(userId, thirtyDaysAgo),
    findClosestSnapshot(userId, oneYearAgo),
  ]);

  res.json({
    ...current,
    monthlyChange: monthAgoSnapshot ? Math.round((current.netWorth - monthAgoSnapshot.netWorth) * 100) / 100 : null,
    yearlyChange: yearAgoSnapshot ? Math.round((current.netWorth - yearAgoSnapshot.netWorth) * 100) / 100 : null,
  });
});

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(90),
});

export const getNetWorthHistory = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { days } = historyQuerySchema.parse(req.query);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await NetWorthSnapshot.find({ userId: req.userId, date: { $gte: since } }).sort({ date: 1 });
  res.json({ snapshots });
});
