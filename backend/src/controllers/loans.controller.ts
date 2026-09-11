import { Response } from "express";
import { z } from "zod";
import { Loan } from "../models/Loan";
import { Account } from "../models/Account";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { applyPayment, calculateEmi, generateAmortizationSchedule } from "../services/loan.service";
import { createExpenseTransaction } from "../services/transaction.service";

const createSchema = z.object({
  name: z.string().min(1),
  principal: z.number().positive(),
  interestRate: z.number().min(0),
  tenureMonths: z.number().int().positive(),
  startDate: z.coerce.date(),
  accountId: z.string().nullable().optional(),
});

const paySchema = z.object({
  amount: z.number().positive().optional(), // defaults to the EMI
});

function nextMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export const listLoans = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const loans = await Loan.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({
    loans: loans.map((l) => ({
      ...l.toObject(),
      totalPaid: l.payments.reduce((s, p) => s + p.amount, 0),
      totalInterestPaid: l.payments.reduce((s, p) => s + p.interestComponent, 0),
      remainingInstallments: Math.max(0, l.tenureMonths - l.payments.length),
    })),
  });
});

export const getLoan = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const loan = await Loan.findOne({ _id: req.params.id, userId: req.userId });
  if (!loan) throw new HttpError(404, "Loan not found");
  res.json({
    loan: {
      ...loan.toObject(),
      totalPaid: loan.payments.reduce((s, p) => s + p.amount, 0),
      totalInterestPaid: loan.payments.reduce((s, p) => s + p.interestComponent, 0),
      remainingInstallments: Math.max(0, loan.tenureMonths - loan.payments.length),
    },
  });
});

export const getAmortizationSchedule = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const loan = await Loan.findOne({ _id: req.params.id, userId: req.userId });
  if (!loan) throw new HttpError(404, "Loan not found");
  const schedule = generateAmortizationSchedule(loan.principal, loan.interestRate, loan.tenureMonths);
  res.json({ schedule });
});

export const createLoan = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createSchema.parse(req.body);

  if (body.accountId) {
    const account = await Account.findOne({ _id: body.accountId, userId: req.userId });
    if (!account) throw new HttpError(404, "Account not found");
  }

  const emi = calculateEmi(body.principal, body.interestRate, body.tenureMonths);

  const loan = await Loan.create({
    ...body,
    userId: req.userId,
    emi,
    remainingPrincipal: body.principal,
    nextPaymentDate: nextMonth(body.startDate),
    payments: [],
  });

  res.status(201).json({ loan });
});

export const deleteLoan = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const loan = await Loan.findOne({ _id: req.params.id, userId: req.userId });
  if (!loan) throw new HttpError(404, "Loan not found");
  await loan.deleteOne();
  res.status(204).send();
});

export const payLoan = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = paySchema.parse(req.body);
  const loan = await Loan.findOne({ _id: req.params.id, userId: req.userId });
  if (!loan) throw new HttpError(404, "Loan not found");
  if (loan.remainingPrincipal <= 0) throw new HttpError(400, "This loan is already fully paid off");

  const amount = body.amount ?? loan.emi;
  const { principalComponent, interestComponent, remainingPrincipal } = applyPayment(
    loan.remainingPrincipal,
    loan.interestRate,
    amount
  );

  loan.payments.push({ date: new Date(), amount, principalComponent, interestComponent, remainingPrincipalAfter: remainingPrincipal });
  loan.remainingPrincipal = remainingPrincipal;
  loan.nextPaymentDate = nextMonth(loan.nextPaymentDate);

  let transaction = null;
  if (loan.accountId) {
    transaction = await createExpenseTransaction({
      userId: req.userId!,
      accountId: String(loan.accountId),
      amount,
      date: new Date(),
      description: `${loan.name} (loan payment)`,
      category: "Loan Payment",
      type: "loan_payment",
    });
  }

  await loan.save();

  res.status(201).json({ loan, transaction });
});
