export interface AmortizationRow {
  month: number;
  emi: number;
  principalComponent: number;
  interestComponent: number;
  remainingPrincipal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Standard reducing-balance EMI formula: EMI = P * r * (1+r)^n / ((1+r)^n - 1),
 * r = monthly rate (annual% / 12 / 100), n = tenure in months.
 */
export function calculateEmi(principal: number, annualInterestRate: number, tenureMonths: number): number {
  if (annualInterestRate === 0) return round2(principal / tenureMonths);
  const r = annualInterestRate / 12 / 100;
  const factor = Math.pow(1 + r, tenureMonths);
  return round2((principal * r * factor) / (factor - 1));
}

/** Full projected schedule from scratch — a pure calculation, independent of actual recorded payments. */
export function generateAmortizationSchedule(
  principal: number,
  annualInterestRate: number,
  tenureMonths: number
): AmortizationRow[] {
  const emi = calculateEmi(principal, annualInterestRate, tenureMonths);
  const r = annualInterestRate / 12 / 100;
  let remaining = principal;
  const schedule: AmortizationRow[] = [];

  for (let month = 1; month <= tenureMonths; month++) {
    const interestComponent = round2(remaining * r);
    let principalComponent = round2(emi - interestComponent);
    if (month === tenureMonths || principalComponent > remaining) {
      principalComponent = round2(remaining);
    }
    remaining = round2(Math.max(0, remaining - principalComponent));

    schedule.push({ month, emi, principalComponent, interestComponent, remainingPrincipal: remaining });
  }

  return schedule;
}

/** One real payment applied against the current remaining principal (used when a payment is recorded). */
export function applyPayment(
  remainingPrincipal: number,
  annualInterestRate: number,
  paymentAmount: number
): { principalComponent: number; interestComponent: number; remainingPrincipal: number } {
  const r = annualInterestRate / 12 / 100;
  const interestComponent = round2(remainingPrincipal * r);
  let principalComponent = round2(paymentAmount - interestComponent);
  if (principalComponent < 0) principalComponent = 0;
  if (principalComponent > remainingPrincipal) principalComponent = remainingPrincipal;
  const newRemaining = round2(Math.max(0, remainingPrincipal - principalComponent));
  return { principalComponent, interestComponent, remainingPrincipal: newRemaining };
}
