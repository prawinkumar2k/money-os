import { Account } from "../models/Account";
import { Investment } from "../models/Investment";
import { Loan } from "../models/Loan";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface NetWorthBreakdown {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  breakdown: {
    bankAndCashBalances: number;
    investments: number;
    creditCardDebt: number;
    loanDebt: number;
  };
}

export async function computeNetWorth(userId: string): Promise<NetWorthBreakdown> {
  const [accounts, investments, loans] = await Promise.all([
    Account.find({ userId }).select("type balance"),
    Investment.find({ userId }).select("units currentPrice"),
    Loan.find({ userId }).select("remainingPrincipal"),
  ]);

  const bankAndCashBalances = accounts
    .filter((a) => a.type !== "credit_card")
    .reduce((sum, a) => sum + a.balance, 0);

  const creditCardDebt = accounts
    .filter((a) => a.type === "credit_card")
    .reduce((sum, a) => sum + Math.max(0, -a.balance), 0);

  const investmentsValue = investments.reduce((sum, i) => sum + i.units * i.currentPrice, 0);
  const loanDebt = loans.reduce((sum, l) => sum + l.remainingPrincipal, 0);

  const totalAssets = round2(Math.max(0, bankAndCashBalances) + investmentsValue);
  const totalLiabilities = round2(creditCardDebt + loanDebt + Math.max(0, -bankAndCashBalances));
  const netWorth = round2(totalAssets - totalLiabilities);

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    breakdown: {
      bankAndCashBalances: round2(bankAndCashBalances),
      investments: round2(investmentsValue),
      creditCardDebt: round2(creditCardDebt),
      loanDebt: round2(loanDebt),
    },
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Records today's net worth as a snapshot (upsert — recomputing later the same day overwrites it). */
export async function recordSnapshot(userId: string): Promise<void> {
  const { totalAssets, totalLiabilities, netWorth } = await computeNetWorth(userId);
  await NetWorthSnapshot.updateOne(
    { userId, date: startOfToday() },
    { $set: { totalAssets, totalLiabilities, netWorth } },
    { upsert: true }
  );
}
