import { getDb, genId, nowIso } from "./db";
import { applyBalanceDeltaLocal } from "./accounts";
import { applyPayment, calculateEmi, generateAmortizationSchedule, AmortizationRow } from "./loanCalc";
import type { CreateLoanInput, Loan, LoanPayment } from "../api/loans";

function nextMonth(dateIso: string): string {
  const d = new Date(dateIso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

async function getPayments(db: Awaited<ReturnType<typeof getDb>>, loanId: string): Promise<LoanPayment[]> {
  const res = await db.query(
    "SELECT date, amount, principalComponent, interestComponent, remainingPrincipalAfter FROM loan_payments WHERE loanId = ? ORDER BY date ASC",
    [loanId]
  );
  return res.values ?? [];
}

function withComputedFields(row: Record<string, unknown>, payments: LoanPayment[]): Loan {
  return {
    _id: row.id as string,
    name: row.name as string,
    principal: row.principal as number,
    interestRate: row.interestRate as number,
    tenureMonths: row.tenureMonths as number,
    emi: row.emi as number,
    startDate: row.startDate as string,
    accountId: (row.accountId as string | null) ?? null,
    remainingPrincipal: row.remainingPrincipal as number,
    nextPaymentDate: row.nextPaymentDate as string,
    payments,
    totalPaid: payments.reduce((s, p) => s + p.amount, 0),
    totalInterestPaid: payments.reduce((s, p) => s + p.interestComponent, 0),
    remainingInstallments: Math.max(0, (row.tenureMonths as number) - payments.length),
  };
}

export async function listLoansLocal(): Promise<Loan[]> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM loans WHERE deletedAt IS NULL ORDER BY createdAt DESC");
  const loans: Loan[] = [];
  for (const row of res.values ?? []) {
    loans.push(withComputedFields(row, await getPayments(db, row.id)));
  }
  return loans;
}

export async function createLoanLocal(input: CreateLoanInput): Promise<Loan> {
  const db = await getDb();
  const id = genId();
  const now = nowIso();
  const emi = calculateEmi(input.principal, input.interestRate, input.tenureMonths);
  await db.run(
    `INSERT INTO loans (id, name, principal, interestRate, tenureMonths, emi, startDate, accountId, remainingPrincipal, nextPaymentDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.principal, input.interestRate, input.tenureMonths, emi, input.startDate, input.accountId ?? null, input.principal, nextMonth(input.startDate), now, now]
  );
  const res = await db.query("SELECT * FROM loans WHERE id = ?", [id]);
  return withComputedFields(res.values![0], []);
}

export async function deleteLoanLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE loans SET deletedAt = ? WHERE id = ?", [nowIso(), id]);
}

export async function payLoanLocal(id: string, amount?: number): Promise<Loan> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM loans WHERE id = ?", [id]);
  const loan = res.values?.[0];
  if (!loan) throw new Error("Loan not found");
  if (loan.remainingPrincipal <= 0) throw new Error("This loan is already fully paid off");

  const payAmount = amount ?? loan.emi;
  const { principalComponent, interestComponent, remainingPrincipal } = applyPayment(loan.remainingPrincipal, loan.interestRate, payAmount);

  const now = nowIso();
  await db.run(
    "INSERT INTO loan_payments (id, loanId, date, amount, principalComponent, interestComponent, remainingPrincipalAfter) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [genId(), id, now, payAmount, principalComponent, interestComponent, remainingPrincipal]
  );
  const nextDue = nextMonth(loan.nextPaymentDate);
  await db.run("UPDATE loans SET remainingPrincipal = ?, nextPaymentDate = ?, updatedAt = ? WHERE id = ?", [remainingPrincipal, nextDue, now, id]);

  if (loan.accountId) {
    const txnId = genId();
    await db.run(
      `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
       VALUES (?, ?, ?, 'INR', ?, ?, NULL, 'Loan Payment', NULL, 'loan_payment', NULL, '[]', NULL, ?, ?)`,
      [txnId, loan.accountId, -Math.abs(payAmount), now, `${loan.name} (loan payment)`, now, now]
    );
    await applyBalanceDeltaLocal(loan.accountId, -Math.abs(payAmount));
  }

  const updated = await db.query("SELECT * FROM loans WHERE id = ?", [id]);
  return withComputedFields(updated.values![0], await getPayments(db, id));
}

export async function getAmortizationScheduleLocal(id: string): Promise<AmortizationRow[]> {
  const db = await getDb();
  const res = await db.query("SELECT principal, interestRate, tenureMonths FROM loans WHERE id = ?", [id]);
  const loan = res.values?.[0];
  if (!loan) throw new Error("Loan not found");
  return generateAmortizationSchedule(loan.principal, loan.interestRate, loan.tenureMonths);
}
