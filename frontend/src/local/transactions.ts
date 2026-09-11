import { getDb, genId, nowIso } from "./db";
import { applyBalanceDeltaLocal } from "./accounts";
import { categorizeLocal } from "./categorize";
import type {
  CreateSingleLegInput,
  CreateTransferInput,
  Transaction,
  TransactionFilters,
  TransactionListResult,
} from "../api/transactions";

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    _id: row.id as string,
    accountId: row.accountId as string,
    amount: row.amount as number,
    currency: row.currency as string,
    date: row.date as string,
    description: row.description as string,
    merchant: (row.merchant as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    type: row.type as string,
    provider: "manual",
    isMockData: false,
    source: "manual",
    transferGroupId: (row.transferGroupId as string | null) ?? null,
    receiptImage: (row.receiptImage as string | null) ?? null,
  };
}

export async function listTransactionsLocal(filters: TransactionFilters = {}): Promise<TransactionListResult> {
  const db = await getDb();
  const where: string[] = ["deletedAt IS NULL"];
  const params: unknown[] = [];

  if (filters.accountId) {
    where.push("accountId = ?");
    params.push(filters.accountId);
  }
  if (filters.category) {
    where.push("category = ?");
    params.push(filters.category);
  }
  if (filters.type) {
    where.push("type = ?");
    params.push(filters.type);
  }
  if (filters.dateFrom) {
    where.push("date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push("date <= ?");
    params.push(filters.dateTo);
  }
  if (filters.q) {
    where.push("(description LIKE ? OR merchant LIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }

  const whereClause = where.join(" AND ");
  const countRes = await db.query(`SELECT COUNT(*) as count FROM "transactions" WHERE ${whereClause}`, params);
  const total = countRes.values?.[0]?.count ?? 0;

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  const offset = (page - 1) * limit;

  const res = await db.query(
    `SELECT * FROM "transactions" WHERE ${whereClause} ORDER BY date DESC, createdAt DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    transactions: (res.values ?? []).map(rowToTransaction),
    pagination: { page, limit, total },
  };
}

export async function createTransactionLocal(input: CreateSingleLegInput | CreateTransferInput): Promise<{ transaction: Transaction } | { transactions: Transaction[] }> {
  const db = await getDb();
  const now = nowIso();

  if ("fromAccountId" in input) {
    const transferGroupId = genId();
    const outId = genId();
    const inId = genId();

    await db.run(
      `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
       VALUES (?, ?, ?, 'INR', ?, ?, NULL, 'Transfer', NULL, 'transfer', NULL, '[]', ?, ?, ?)`,
      [outId, input.fromAccountId, -Math.abs(input.amount), input.date, input.description, transferGroupId, now, now]
    );
    await db.run(
      `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
       VALUES (?, ?, ?, 'INR', ?, ?, NULL, 'Transfer', NULL, 'transfer', NULL, '[]', ?, ?, ?)`,
      [inId, input.toAccountId, Math.abs(input.amount), input.date, input.description, transferGroupId, now, now]
    );
    await applyBalanceDeltaLocal(input.fromAccountId, -Math.abs(input.amount));
    await applyBalanceDeltaLocal(input.toAccountId, Math.abs(input.amount));

    const outRow = await db.query(`SELECT * FROM "transactions" WHERE id = ?`, [outId]);
    const inRow = await db.query(`SELECT * FROM "transactions" WHERE id = ?`, [inId]);
    return { transactions: [rowToTransaction(outRow.values![0]), rowToTransaction(inRow.values![0])] };
  }

  const id = genId();
  const category = input.category ?? (await categorizeLocal(input.merchant ?? null, input.description));

  await db.run(
    `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
     VALUES (?, ?, ?, 'INR', ?, ?, ?, ?, NULL, ?, ?, '[]', NULL, ?, ?)`,
    [id, input.accountId, input.amount, input.date, input.description, input.merchant ?? null, category, input.type, input.notes ?? null, now, now]
  );
  await applyBalanceDeltaLocal(input.accountId, input.amount);

  const row = await db.query(`SELECT * FROM "transactions" WHERE id = ?`, [id]);
  return { transaction: rowToTransaction(row.values![0]) };
}

export async function deleteTransactionLocal(id: string): Promise<void> {
  const db = await getDb();
  const res = await db.query(`SELECT * FROM "transactions" WHERE id = ?`, [id]);
  const row = res.values?.[0];
  if (!row) return;

  if (row.transferGroupId) {
    const legs = await db.query(`SELECT * FROM "transactions" WHERE transferGroupId = ?`, [row.transferGroupId]);
    for (const leg of legs.values ?? []) {
      await applyBalanceDeltaLocal(leg.accountId, -leg.amount);
    }
    await db.run(`UPDATE "transactions" SET deletedAt = ? WHERE transferGroupId = ?`, [nowIso(), row.transferGroupId]);
  } else {
    await applyBalanceDeltaLocal(row.accountId, -row.amount);
    await db.run(`UPDATE "transactions" SET deletedAt = ? WHERE id = ?`, [nowIso(), id]);
  }
}

export async function updateTransactionCategoryLocal(id: string, category: string, rememberRule = false): Promise<void> {
  const db = await getDb();
  await db.run(`UPDATE "transactions" SET category = ?, updatedAt = ? WHERE id = ?`, [category, nowIso(), id]);

  if (rememberRule) {
    const txnRes = await db.query(`SELECT merchant FROM "transactions" WHERE id = ?`, [id]);
    const merchant = txnRes.values?.[0]?.merchant;
    if (merchant) {
      const catRes = await db.query("SELECT id, merchantRules FROM categories WHERE name = ?", [category]);
      const catRow = catRes.values?.[0];
      if (catRow) {
        const rules: string[] = JSON.parse(catRow.merchantRules);
        if (!rules.includes(merchant)) {
          rules.push(merchant);
          await db.run("UPDATE categories SET merchantRules = ?, updatedAt = ? WHERE id = ?", [JSON.stringify(rules), nowIso(), catRow.id]);
        }
      }
    }
  }
}

export async function setTransactionReceiptLocal(id: string, image: string): Promise<Transaction> {
  const db = await getDb();
  await db.run(`UPDATE "transactions" SET receiptImage = ?, updatedAt = ? WHERE id = ?`, [image, nowIso(), id]);
  const res = await db.query(`SELECT * FROM "transactions" WHERE id = ?`, [id]);
  return rowToTransaction(res.values![0]);
}

export async function deleteTransactionReceiptLocal(id: string): Promise<Transaction> {
  const db = await getDb();
  await db.run(`UPDATE "transactions" SET receiptImage = NULL, updatedAt = ? WHERE id = ?`, [nowIso(), id]);
  const res = await db.query(`SELECT * FROM "transactions" WHERE id = ?`, [id]);
  return rowToTransaction(res.values![0]);
}
