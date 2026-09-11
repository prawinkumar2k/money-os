import { apiFetch } from "./client";

export interface LoanPayment {
  date: string;
  amount: number;
  principalComponent: number;
  interestComponent: number;
  remainingPrincipalAfter: number;
}

export interface Loan {
  _id: string;
  name: string;
  principal: number;
  interestRate: number;
  tenureMonths: number;
  emi: number;
  startDate: string;
  accountId: string | null;
  remainingPrincipal: number;
  nextPaymentDate: string;
  payments: LoanPayment[];
  totalPaid: number;
  totalInterestPaid: number;
  remainingInstallments: number;
}

export interface CreateLoanInput {
  name: string;
  principal: number;
  interestRate: number;
  tenureMonths: number;
  startDate: string;
  accountId?: string | null;
}

export interface AmortizationRow {
  month: number;
  emi: number;
  principalComponent: number;
  interestComponent: number;
  remainingPrincipal: number;
}

export async function listLoans(): Promise<Loan[]> {
  const data = await apiFetch("/loans");
  return data.loans;
}

export async function createLoan(input: CreateLoanInput): Promise<Loan> {
  const data = await apiFetch("/loans", { method: "POST", body: JSON.stringify(input) });
  return data.loan;
}

export async function deleteLoan(id: string): Promise<void> {
  await apiFetch(`/loans/${id}`, { method: "DELETE" });
}

export async function payLoan(id: string, amount?: number): Promise<Loan> {
  const data = await apiFetch(`/loans/${id}/pay`, { method: "POST", body: JSON.stringify(amount ? { amount } : {}) });
  return data.loan;
}

export async function getAmortizationSchedule(id: string): Promise<AmortizationRow[]> {
  const data = await apiFetch(`/loans/${id}/amortization-schedule`);
  return data.schedule;
}
