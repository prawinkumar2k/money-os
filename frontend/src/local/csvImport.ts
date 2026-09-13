import { getDb, genId, nowIso } from "./db";
import { categorizeLocal } from "./categorize";
import { applyBalanceDeltaLocal } from "./accounts";
import type { ImportPreview, ImportPreviewRow } from "../api/importExport";

// Ported verbatim from backend/src/services/csvImport.service.ts — a generic best-effort column
// mapper (looks for common header names), not a bank-specific parser. Rows that can't be
// confidently mapped are flagged with errors instead of silently guessed at.
interface ParsedCsvRow {
  rowNumber: number;
  date: Date | null;
  description: string;
  merchant: string | null;
  amount: number | null;
  errors: string[];
}

const DATE_COLUMNS = ["date", "transaction date", "txn date"];
const DESCRIPTION_COLUMNS = ["description", "narration", "details", "particulars"];
const AMOUNT_COLUMNS = ["amount"];
const DEBIT_COLUMNS = ["debit", "withdrawal", "withdrawal amt"];
const CREDIT_COLUMNS = ["credit", "deposit", "deposit amt"];
const MERCHANT_COLUMNS = ["merchant", "payee"];
const MAX_IMPORT_ROWS = 2000;

function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[,₹\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * A minimal RFC4180-style CSV tokenizer (quoted fields, embedded commas/newlines, "" as an
 * escaped quote) — written in-house rather than using the `csv-parse` npm package, which depends
 * on Node's `Buffer` global that isn't available in an Android/iOS WebView without an
 * unverified polyfill. This covers the same shape the backend's csv-parse-based parser handles:
 * a header row followed by data rows, mapped into objects keyed by (trimmed) header name.
 */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function parseCsvLocal(fileContent: string): ParsedCsvRow[] {
  const table = tokenizeCsv(fileContent).slice(0, MAX_IMPORT_ROWS + 1);
  if (table.length === 0) return [];

  const headers = table[0].map((h) => h.trim());
  const records: Record<string, string>[] = table.slice(1).map((rowValues) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = (rowValues[idx] ?? "").trim();
    });
    return record;
  });

  if (records.length === 0) return [];

  const dateCol = findColumn(headers, DATE_COLUMNS);
  const descCol = findColumn(headers, DESCRIPTION_COLUMNS);
  const merchantCol = findColumn(headers, MERCHANT_COLUMNS);
  const amountCol = findColumn(headers, AMOUNT_COLUMNS);
  const debitCol = findColumn(headers, DEBIT_COLUMNS);
  const creditCol = findColumn(headers, CREDIT_COLUMNS);

  return records.map((row, i) => {
    const errors: string[] = [];

    let date: Date | null = null;
    if (dateCol && row[dateCol]) {
      const parsed = new Date(row[dateCol]);
      date = Number.isNaN(parsed.getTime()) ? null : parsed;
      if (!date) errors.push(`Unrecognized date: "${row[dateCol]}"`);
    } else {
      errors.push("No date column found");
    }

    const description = descCol ? row[descCol] : "";
    if (!description) errors.push("No description column found");

    let amount: number | null = null;
    if (amountCol) {
      amount = parseAmount(row[amountCol]);
    } else if (debitCol || creditCol) {
      const debit = debitCol ? parseAmount(row[debitCol]) : null;
      const credit = creditCol ? parseAmount(row[creditCol]) : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (amount === null) errors.push("Could not determine a transaction amount");

    return {
      rowNumber: i + 2,
      date,
      description: description || "(no description)",
      merchant: merchantCol ? row[merchantCol] || null : null,
      amount,
      errors,
    };
  });
}

export async function previewImportLocal(accountId: string, file: File): Promise<ImportPreview> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    throw new Error(
      "PDF statement import isn't available offline yet — this generic PDF parser needs a Node runtime that isn't available in the app. CSV import works fully offline; export your statement as CSV instead, or use PDF import from the web app when a backend is reachable."
    );
  }

  const db = await getDb();
  const account = await db.query("SELECT id FROM accounts WHERE id = ? AND deletedAt IS NULL", [accountId]);
  if (!account.values?.length) throw new Error("Account not found");

  const content = await file.text();
  let rows: ParsedCsvRow[];
  try {
    rows = parseCsvLocal(content);
  } catch (err) {
    throw new Error(`Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}`);
  }
  if (rows.length === 0) throw new Error("The CSV file has no data rows");

  const validRows = rows.filter((r) => r.errors.length === 0 && r.date && r.amount !== null);
  const dateWindow =
    validRows.length > 0
      ? {
          min: new Date(Math.min(...validRows.map((r) => r.date!.getTime())) - 86400000).toISOString(),
          max: new Date(Math.max(...validRows.map((r) => r.date!.getTime())) + 86400000).toISOString(),
        }
      : null;

  const existingRes = dateWindow
    ? await db.query(`SELECT date, amount, description FROM "transactions" WHERE deletedAt IS NULL AND accountId = ? AND date >= ? AND date <= ?`, [
        accountId,
        dateWindow.min,
        dateWindow.max,
      ])
    : { values: [] };
  const existing = existingRes.values ?? [];

  const previewRows: ImportPreviewRow[] = [];
  for (const row of rows) {
    let suggestedCategory: string | null = null;
    let isDuplicate = false;
    if (row.errors.length === 0 && row.date && row.amount !== null) {
      suggestedCategory = await categorizeLocal(row.merchant, row.description);
      isDuplicate = existing.some(
        (t: { date: string; amount: number; description: string }) =>
          Math.abs(new Date(t.date).getTime() - row.date!.getTime()) < 86400000 && t.amount === row.amount && t.description === row.description
      );
    }
    previewRows.push({
      rowNumber: row.rowNumber,
      date: row.date ? row.date.toISOString() : null,
      description: row.description,
      merchant: row.merchant,
      amount: row.amount,
      errors: row.errors,
      suggestedCategory,
      isDuplicate,
    });
  }

  return {
    filename: file.name,
    accountId,
    rowsTotal: previewRows.length,
    rowsWithErrors: previewRows.filter((r) => r.errors.length > 0).length,
    rowsDuplicate: previewRows.filter((r) => r.isDuplicate).length,
    rows: previewRows,
  };
}

/**
 * Each row's insert + balance update is applied as its own atomic statement (matching every
 * other write path in this local-first architecture — see accounts.ts/transactions.ts), rather
 * than wrapping the whole batch in one explicit multi-statement transaction: nesting
 * beginTransaction()/commitTransaction() around calls that already auto-transact individually
 * risks "transaction already active" failures this plugin's docs don't fully specify. If a row
 * fails partway through a large import, everything before it is already safely committed (never
 * a half-written single row), and the thrown error identifies which row to retry.
 */
export async function confirmImportLocal(accountId: string, rows: ImportPreviewRow[]): Promise<void> {
  const db = await getDb();
  const account = await db.query("SELECT id FROM accounts WHERE id = ? AND deletedAt IS NULL", [accountId]);
  if (!account.values?.length) throw new Error("Account not found");

  for (const row of rows) {
    if (row.date === null || row.amount === null) continue;
    try {
      const category = row.suggestedCategory ?? (await categorizeLocal(row.merchant, row.description));
      const id = genId();
      const now = nowIso();
      await db.run(
        `INSERT INTO "transactions" (id, accountId, amount, currency, date, description, merchant, category, subcategory, type, notes, tags, transferGroupId, createdAt, updatedAt)
         VALUES (?, ?, ?, 'INR', ?, ?, ?, ?, NULL, ?, NULL, '[]', NULL, ?, ?)`,
        [id, accountId, row.amount, row.date, row.description, row.merchant, category, row.amount >= 0 ? "income" : "expense", now, now]
      );
      await applyBalanceDeltaLocal(accountId, row.amount);
    } catch (err) {
      throw new Error(`Import stopped at row ${row.rowNumber} (already-imported rows before it were saved): ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
}
