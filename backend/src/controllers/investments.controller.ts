import { Response } from "express";
import { z } from "zod";
import { Investment } from "../models/Investment";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { applyBalanceDelta } from "../services/transaction.service";

const INVESTMENT_TYPES = ["stock", "mutual_fund", "etf", "gold", "fixed_deposit", "recurring_deposit", "other"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(INVESTMENT_TYPES),
  currentPrice: z.number().positive(),
  accountId: z.string().nullable().optional(),
});

const tradeSchema = z.object({
  units: z.number().positive(),
  pricePerUnit: z.number().positive(),
});

const updatePriceSchema = z.object({
  currentPrice: z.number().positive(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

function withComputedFields(inv: InstanceType<typeof Investment>) {
  const currentValue = round2(inv.units * inv.currentPrice);
  const profitLoss = round2(currentValue - inv.investedAmount);
  const returnPercent = inv.investedAmount > 0 ? round2((profitLoss / inv.investedAmount) * 100) : 0;
  return { ...inv.toObject(), currentValue, profitLoss, returnPercent };
}

export const listInvestments = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const investments = await Investment.find({ userId: req.userId }).sort({ createdAt: -1 });
  const withFields = investments.map(withComputedFields);
  const totalInvested = withFields.reduce((s, i) => s + i.investedAmount, 0);
  const totalCurrentValue = withFields.reduce((s, i) => s + i.currentValue, 0);
  res.json({
    investments: withFields,
    totalInvested: round2(totalInvested),
    totalCurrentValue: round2(totalCurrentValue),
    totalProfitLoss: round2(totalCurrentValue - totalInvested),
  });
});

export const getInvestment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const investment = await Investment.findOne({ _id: req.params.id, userId: req.userId });
  if (!investment) throw new HttpError(404, "Investment not found");
  res.json({ investment: withComputedFields(investment) });
});

export const createInvestment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createSchema.parse(req.body);

  if (body.accountId) {
    const account = await Account.findOne({ _id: body.accountId, userId: req.userId });
    if (!account) throw new HttpError(404, "Account not found");
  }

  const investment = await Investment.create({
    ...body,
    userId: req.userId,
    units: 0,
    avgBuyPrice: 0,
    investedAmount: 0,
    isManualPrice: true,
    priceUpdatedAt: new Date(),
    transactions: [],
  });

  res.status(201).json({ investment: withComputedFields(investment) });
});

export const deleteInvestment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const investment = await Investment.findOne({ _id: req.params.id, userId: req.userId });
  if (!investment) throw new HttpError(404, "Investment not found");
  await investment.deleteOne();
  res.status(204).send();
});

export const updatePrice = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = updatePriceSchema.parse(req.body);
  const investment = await Investment.findOne({ _id: req.params.id, userId: req.userId });
  if (!investment) throw new HttpError(404, "Investment not found");

  investment.currentPrice = body.currentPrice;
  investment.isManualPrice = true; // no live provider is connected — see marketData.service.ts
  investment.priceUpdatedAt = new Date();
  await investment.save();

  res.json({ investment: withComputedFields(investment) });
});

export const buyInvestment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = tradeSchema.parse(req.body);
  const investment = await Investment.findOne({ _id: req.params.id, userId: req.userId });
  if (!investment) throw new HttpError(404, "Investment not found");

  const amount = round2(body.units * body.pricePerUnit);
  const newInvestedAmount = round2(investment.investedAmount + amount);
  const newUnits = round2(investment.units + body.units);

  investment.avgBuyPrice = newUnits > 0 ? round2(newInvestedAmount / newUnits) : 0;
  investment.units = newUnits;
  investment.investedAmount = newInvestedAmount;
  investment.transactions.push({ date: new Date(), type: "buy", units: body.units, pricePerUnit: body.pricePerUnit, amount });

  if (investment.accountId) {
    await Transaction.create({
      userId: req.userId,
      accountId: investment.accountId,
      amount: -amount,
      date: new Date(),
      description: `Buy ${body.units} units of ${investment.name}`,
      category: "Investments",
      type: "investment",
      provider: "manual",
      isMockData: false,
      source: "manual",
    });
    await applyBalanceDelta(req.userId!, String(investment.accountId), -amount);
  }

  await investment.save();
  res.status(201).json({ investment: withComputedFields(investment) });
});

export const sellInvestment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = tradeSchema.parse(req.body);
  const investment = await Investment.findOne({ _id: req.params.id, userId: req.userId });
  if (!investment) throw new HttpError(404, "Investment not found");
  if (body.units > investment.units) throw new HttpError(400, "Cannot sell more units than currently held");

  const amount = round2(body.units * body.pricePerUnit);
  const costBasisSold = round2(investment.avgBuyPrice * body.units);

  investment.units = round2(investment.units - body.units);
  investment.investedAmount = round2(Math.max(0, investment.investedAmount - costBasisSold));
  investment.transactions.push({ date: new Date(), type: "sell", units: body.units, pricePerUnit: body.pricePerUnit, amount });

  if (investment.accountId) {
    await Transaction.create({
      userId: req.userId,
      accountId: investment.accountId,
      amount,
      date: new Date(),
      description: `Sell ${body.units} units of ${investment.name}`,
      category: "Investments",
      type: "investment",
      provider: "manual",
      isMockData: false,
      source: "manual",
    });
    await applyBalanceDelta(req.userId!, String(investment.accountId), amount);
  }

  await investment.save();
  res.status(201).json({ investment: withComputedFields(investment) });
});
