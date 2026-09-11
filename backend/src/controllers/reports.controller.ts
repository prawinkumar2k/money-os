import { Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { generateRangeReport, generateYearlyReport } from "../services/report.service";
import { Transaction } from "../models/Transaction";

const monthlyQuerySchema = z.object({
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
});

const yearlyQuerySchema = z.object({
  year: z.coerce.number().int(),
});

const taxQuerySchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});

export const getMonthlyReport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { year, month } = monthlyQuerySchema.parse(req.query);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  const report = await generateRangeReport(req.userId!, from, to);
  res.json({ report });
});

export const getYearlyReport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { year } = yearlyQuerySchema.parse(req.query);
  const report = await generateYearlyReport(req.userId!, year);
  res.json({ report });
});

export const getIncomeReport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { dateFrom, dateTo } = taxQuerySchema.parse(req.query);
  const transactions = await Transaction.find({ userId: req.userId, date: { $gte: dateFrom, $lte: dateTo }, amount: { $gt: 0 }, type: { $ne: "transfer" } }).sort({ date: -1 });
  res.json({ transactions, total: transactions.reduce((s, t) => s + t.amount, 0) });
});

export const getExpenseReport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { dateFrom, dateTo } = taxQuerySchema.parse(req.query);
  const transactions = await Transaction.find({ userId: req.userId, date: { $gte: dateFrom, $lte: dateTo }, amount: { $lt: 0 }, type: { $ne: "transfer" } }).sort({ date: -1 });
  res.json({ transactions, total: -transactions.reduce((s, t) => s + t.amount, 0) });
});

// A plain listing of all non-transfer transactions in a date range, for the user's own tax
// filing reference — this is not tax advice and makes no attempt to classify taxability.
export const getTaxTransactionReport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { dateFrom, dateTo } = taxQuerySchema.parse(req.query);
  const transactions = await Transaction.find({ userId: req.userId, date: { $gte: dateFrom, $lte: dateTo }, type: { $ne: "transfer" } }).sort({ date: 1 });
  res.json({ transactions, disclaimer: "This is a plain transaction listing for your own records, not tax advice." });
});
