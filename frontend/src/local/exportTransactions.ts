import { getDb } from "./db";

const COLUMNS = ["Date", "Description", "Merchant", "Category", "Type", "Account", "Amount", "Currency"] as const;

// Ported from backend/src/controllers/export.controller.ts's sanitizeCsvCell — a value that came
// from an imported CSV (attacker-controlled, e.g. a booby-trapped bank statement) could otherwise
// smuggle a formula into a spreadsheet app that auto-executes when reopened.
function sanitizeCsvCell(value: string): string {
  const escaped = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(escaped)) return `"${escaped.replace(/"/g, '""')}"`;
  return escaped;
}

export async function exportTransactionsLocal(format: "csv" | "xlsx"): Promise<Blob> {
  if (format === "xlsx") {
    throw new Error("Excel (.xlsx) export isn't available offline yet — CSV export works fully offline and opens fine in Excel/Sheets too.");
  }

  const db = await getDb();
  const res = await db.query(
    `SELECT t.date, t.description, t.merchant, t.category, t.type, t.amount, t.currency, a.name as accountName
     FROM "transactions" t LEFT JOIN accounts a ON a.id = t.accountId
     WHERE t.deletedAt IS NULL ORDER BY t.date DESC`
  );

  const lines = [COLUMNS.join(",")];
  for (const t of res.values ?? []) {
    const row = [
      String(t.date).slice(0, 10),
      t.description ?? "",
      t.merchant ?? "",
      t.category ?? "Uncategorized",
      t.type ?? "",
      t.accountName ?? "",
      String(t.amount),
      t.currency ?? "INR",
    ];
    lines.push(row.map(sanitizeCsvCell).join(","));
  }

  return new Blob([lines.join("\n")], { type: "text/csv" });
}
