import { getDb } from "./db";
import type { NetWorthSnapshot, NetWorthSummary } from "../api/netWorth";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Ported from backend/src/services/netWorth.service.ts. Note: this only sums account balances
 * (including accounts of type "investment"/"loan"), not the separate, more detailed
 * Investment/Loan holdings trackers (units/currentPrice, amortization schedules) — those modules
 * are not yet localized (see readme.md's offline-architecture section), so net worth here is real
 * but will under-count for a user who relies on those dedicated trackers rather than a plain
 * account balance for their investments/loans.
 */
export async function computeNetWorthLocal(): Promise<{ totalAssets: number; totalLiabilities: number; netWorth: number; breakdown: NetWorthSummary["breakdown"] }> {
  const db = await getDb();
  const res = await db.query("SELECT type, balance FROM accounts WHERE deletedAt IS NULL");
  const accounts = res.values ?? [];

  const bankAndCashBalances = accounts.filter((a) => a.type !== "credit_card").reduce((sum: number, a: { balance: number }) => sum + a.balance, 0);
  const creditCardDebt = accounts
    .filter((a) => a.type === "credit_card")
    .reduce((sum: number, a: { balance: number }) => sum + Math.max(0, -a.balance), 0);

  const totalAssets = round2(Math.max(0, bankAndCashBalances));
  const totalLiabilities = round2(creditCardDebt + Math.max(0, -bankAndCashBalances));
  const netWorth = round2(totalAssets - totalLiabilities);

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    breakdown: {
      bankAndCashBalances: round2(bankAndCashBalances),
      investments: 0,
      creditCardDebt: round2(creditCardDebt),
      loanDebt: 0,
    },
  };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function recordSnapshotLocal(netWorth: number, totalAssets: number, totalLiabilities: number): Promise<void> {
  const db = await getDb();
  const today = startOfTodayIso();
  await db.run(
    "INSERT INTO net_worth_snapshots (date, netWorth, totalAssets, totalLiabilities) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET netWorth = excluded.netWorth, totalAssets = excluded.totalAssets, totalLiabilities = excluded.totalLiabilities",
    [today, netWorth, totalAssets, totalLiabilities]
  );
}

async function findClosestSnapshotLocal(onOrBefore: string): Promise<{ netWorth: number } | null> {
  const db = await getDb();
  const res = await db.query("SELECT netWorth FROM net_worth_snapshots WHERE date <= ? ORDER BY date DESC LIMIT 1", [onOrBefore]);
  return res.values?.[0] ?? null;
}

export async function getNetWorthLocal(): Promise<NetWorthSummary> {
  const current = await computeNetWorthLocal();
  await recordSnapshotLocal(current.netWorth, current.totalAssets, current.totalLiabilities);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const [monthAgo, yearAgo] = await Promise.all([
    findClosestSnapshotLocal(thirtyDaysAgo.toISOString().slice(0, 10)),
    findClosestSnapshotLocal(oneYearAgo.toISOString().slice(0, 10)),
  ]);

  return {
    ...current,
    monthlyChange: monthAgo ? round2(current.netWorth - monthAgo.netWorth) : null,
    yearlyChange: yearAgo ? round2(current.netWorth - yearAgo.netWorth) : null,
  };
}

export async function getNetWorthHistoryLocal(days = 90): Promise<NetWorthSnapshot[]> {
  const db = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const res = await db.query("SELECT * FROM net_worth_snapshots WHERE date >= ? ORDER BY date ASC", [since.toISOString().slice(0, 10)]);
  return (res.values ?? []).map((r) => ({ date: r.date, netWorth: r.netWorth, totalAssets: r.totalAssets, totalLiabilities: r.totalLiabilities }));
}
