import { getDb, genId, nowIso } from "./db";
import { applyBalanceDeltaLocal } from "./accounts";
import type { CreateInvestmentInput, Investment } from "../api/investments";

const round2 = (n: number) => Math.round(n * 100) / 100;

function withComputedFields(row: Record<string, unknown>): Investment {
  const units = row.units as number;
  const currentPrice = row.currentPrice as number;
  const investedAmount = row.investedAmount as number;
  const currentValue = round2(units * currentPrice);
  const profitLoss = round2(currentValue - investedAmount);
  const returnPercent = investedAmount > 0 ? round2((profitLoss / investedAmount) * 100) : 0;

  return {
    _id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    units,
    avgBuyPrice: row.avgBuyPrice as number,
    investedAmount,
    currentPrice,
    isManualPrice: !!row.isManualPrice,
    priceUpdatedAt: row.priceUpdatedAt as string,
    accountId: (row.accountId as string | null) ?? null,
    currentValue,
    profitLoss,
    returnPercent,
  };
}

export async function listInvestmentsLocal(): Promise<{ investments: Investment[]; totalInvested: number; totalCurrentValue: number; totalProfitLoss: number }> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM investments WHERE deletedAt IS NULL ORDER BY createdAt DESC");
  const investments = (res.values ?? []).map(withComputedFields);
  const totalInvested = round2(investments.reduce((s, i) => s + i.investedAmount, 0));
  const totalCurrentValue = round2(investments.reduce((s, i) => s + i.currentValue, 0));
  return { investments, totalInvested, totalCurrentValue, totalProfitLoss: round2(totalCurrentValue - totalInvested) };
}

export async function createInvestmentLocal(input: CreateInvestmentInput): Promise<Investment> {
  const db = await getDb();
  const id = genId();
  const now = nowIso();
  await db.run(
    `INSERT INTO investments (id, name, type, units, avgBuyPrice, investedAmount, currentPrice, isManualPrice, priceUpdatedAt, accountId, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, 0, 0, ?, 1, ?, ?, ?, ?)`,
    [id, input.name, input.type, input.currentPrice, now, input.accountId ?? null, now, now]
  );
  const res = await db.query("SELECT * FROM investments WHERE id = ?", [id]);
  return withComputedFields(res.values![0]);
}

export async function deleteInvestmentLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE investments SET deletedAt = ? WHERE id = ?", [nowIso(), id]);
}

export async function updateInvestmentPriceLocal(id: string, currentPrice: number): Promise<Investment> {
  const db = await getDb();
  const now = nowIso();
  await db.run("UPDATE investments SET currentPrice = ?, isManualPrice = 1, priceUpdatedAt = ?, updatedAt = ? WHERE id = ?", [currentPrice, now, now, id]);
  const res = await db.query("SELECT * FROM investments WHERE id = ?", [id]);
  return withComputedFields(res.values![0]);
}

export async function buyInvestmentLocal(id: string, units: number, pricePerUnit: number): Promise<Investment> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM investments WHERE id = ?", [id]);
  const inv = res.values?.[0];
  if (!inv) throw new Error("Investment not found");

  const amount = round2(units * pricePerUnit);
  const newInvestedAmount = round2(inv.investedAmount + amount);
  const newUnits = round2(inv.units + units);
  const avgBuyPrice = newUnits > 0 ? round2(newInvestedAmount / newUnits) : 0;

  const now = nowIso();
  await db.run("UPDATE investments SET units = ?, avgBuyPrice = ?, investedAmount = ?, updatedAt = ? WHERE id = ?", [newUnits, avgBuyPrice, newInvestedAmount, now, id]);
  await db.run("INSERT INTO investment_transactions (id, investmentId, date, type, units, pricePerUnit, amount) VALUES (?, ?, ?, 'buy', ?, ?, ?)", [
    genId(),
    id,
    now,
    units,
    pricePerUnit,
    amount,
  ]);

  if (inv.accountId) {
    await db.run(
      `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
       VALUES (?, ?, ?, 'INR', ?, ?, NULL, 'Investments', NULL, 'investment', NULL, '[]', NULL, ?, ?)`,
      [genId(), inv.accountId, -amount, now, `Buy ${units} units of ${inv.name}`, now, now]
    );
    await applyBalanceDeltaLocal(inv.accountId, -amount);
  }

  const updated = await db.query("SELECT * FROM investments WHERE id = ?", [id]);
  return withComputedFields(updated.values![0]);
}

export async function sellInvestmentLocal(id: string, units: number, pricePerUnit: number): Promise<Investment> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM investments WHERE id = ?", [id]);
  const inv = res.values?.[0];
  if (!inv) throw new Error("Investment not found");
  if (units > inv.units) throw new Error("Cannot sell more units than currently held");

  const amount = round2(units * pricePerUnit);
  const costBasisSold = round2(inv.avgBuyPrice * units);
  const newUnits = round2(inv.units - units);
  const newInvestedAmount = round2(Math.max(0, inv.investedAmount - costBasisSold));

  const now = nowIso();
  await db.run("UPDATE investments SET units = ?, investedAmount = ?, updatedAt = ? WHERE id = ?", [newUnits, newInvestedAmount, now, id]);
  await db.run("INSERT INTO investment_transactions (id, investmentId, date, type, units, pricePerUnit, amount) VALUES (?, ?, ?, 'sell', ?, ?, ?)", [
    genId(),
    id,
    now,
    units,
    pricePerUnit,
    amount,
  ]);

  if (inv.accountId) {
    await db.run(
      `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
       VALUES (?, ?, ?, 'INR', ?, ?, NULL, 'Investments', NULL, 'investment', NULL, '[]', NULL, ?, ?)`,
      [genId(), inv.accountId, amount, now, `Sell ${units} units of ${inv.name}`, now, now]
    );
    await applyBalanceDeltaLocal(inv.accountId, amount);
  }

  const updated = await db.query("SELECT * FROM investments WHERE id = ?", [id]);
  return withComputedFields(updated.values![0]);
}
