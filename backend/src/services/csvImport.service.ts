import { parse } from "csv-parse/sync";
import { categorize } from "./categorization.service";
import { Transaction } from "../models/Transaction";

export interface ParsedCsvRow {
  rowNumber: number;
  date: Date | null;
  description: string;
  merchant: string | null;
  amount: number | null;
  raw: Record<string, string>;
  errors: string[];
}

export interface ImportPreviewRow extends ParsedCsvRow {
  suggestedCategory: string | null;
  isDuplicate: boolean;
}

const DATE_COLUMNS = ["date", "transaction date", "txn date"];
const DESCRIPTION_COLUMNS = ["description", "narration", "details", "particulars"];
const AMOUNT_COLUMNS = ["amount"];
const DEBIT_COLUMNS = ["debit", "withdrawal", "withdrawal amt"];
const CREDIT_COLUMNS = ["credit", "deposit", "deposit amt"];
const MERCHANT_COLUMNS = ["merchant", "payee"];

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
 * Parses a CSV bank/expense export into normalized rows. This is a generic best-effort column
 * mapper (looks for common header names), not a bank-specific parser — rows that can't be
 * confidently mapped are flagged with errors instead of silently guessed at.
 */
const MAX_IMPORT_ROWS = 2000;

export function parseCsv(fileContent: string): ParsedCsvRow[] {
  const records: Record<string, string>[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    to: MAX_IMPORT_ROWS,
  });

  if (records.length === 0) return [];
  const headers = Object.keys(records[0]);

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
      rowNumber: i + 2, // account for header row, 1-indexed
      date,
      description: description || "(no description)",
      merchant: merchantCol ? row[merchantCol] || null : null,
      amount,
      raw: row,
      errors,
    };
  });
}

/** Runs categorization + duplicate detection against existing transactions, for a confirmation preview. */
export async function buildImportPreview(userId: string, accountId: string, rows: ParsedCsvRow[]): Promise<ImportPreviewRow[]> {
  const validRows = rows.filter((r) => r.errors.length === 0 && r.date && r.amount !== null);

  const existing = await Transaction.find({
    userId,
    accountId,
    date: { $in: validRows.map((r) => r.date as Date) },
  }).select("date amount description");

  return Promise.all(
    rows.map(async (row) => {
      let suggestedCategory: string | null = null;
      let isDuplicate = false;

      if (row.errors.length === 0 && row.date && row.amount !== null) {
        suggestedCategory = await categorize(userId, row.merchant, row.description);
        isDuplicate = existing.some(
          (t) =>
            Math.abs(t.date.getTime() - (row.date as Date).getTime()) < 24 * 60 * 60 * 1000 &&
            t.amount === row.amount &&
            t.description === row.description
        );
      }

      return { ...row, suggestedCategory, isDuplicate };
    })
  );
}
