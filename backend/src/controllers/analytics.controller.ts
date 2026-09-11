import { Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import {
  getCashFlow,
  getSavingsRateTrend,
  getSpendingByCategory,
  getSpendingByMerchant,
} from "../services/analytics.service";
import { Account } from "../models/Account";

const periodSchema = z.object({
  period: z.enum(["7d", "30d", "3m", "6m", "1y", "all"]).default("30d"),
});

export const getAnalytics = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { period } = periodSchema.parse(req.query);
  const userId = req.userId!;

  const [byCategory, byMerchant, cashFlow, savingsRateTrend, accounts] = await Promise.all([
    getSpendingByCategory(userId, period),
    getSpendingByMerchant(userId, period),
    getCashFlow(userId, period),
    getSavingsRateTrend(userId, period),
    Account.find({ userId }).select("name balance type"),
  ]);

  const accountDistribution = accounts.map((a) => ({ name: a.name, type: a.type, balance: a.balance }));

  res.json({ period, spendingByCategory: byCategory, spendingByMerchant: byMerchant, cashFlow, savingsRateTrend, accountDistribution });
});
