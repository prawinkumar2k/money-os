import { Response } from "express";
import { z } from "zod";
import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { Transaction } from "../models/Transaction";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";

const querySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

const COLUMNS = ["Date", "Description", "Merchant", "Category", "Type", "Account", "Amount", "Currency"] as const;

// Spreadsheet apps auto-interpret a cell starting with =, +, -, or @ as a formula. A value that
// came from an imported CSV (attacker-controlled, e.g. a booby-trapped bank statement) could
// otherwise smuggle a formula into this export and execute when the user reopens it in Excel.
function sanitizeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export const exportTransactions = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { format, dateFrom, dateTo } = querySchema.parse(req.query);

  const filter: Record<string, unknown> = { userId: req.userId };
  if (dateFrom || dateTo) {
    filter.date = { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) };
  }

  const transactions = await Transaction.find(filter).populate("accountId", "name").sort({ date: -1 });

  const rows = transactions.map((t) => [
    t.date.toISOString().slice(0, 10),
    t.description,
    t.merchant ?? "",
    t.category ?? "Uncategorized",
    t.type,
    (t.accountId as unknown as { name?: string })?.name ?? "",
    t.amount,
    t.currency,
  ]);

  if (format === "csv") {
    const csvRows = rows.map((r) => r.map((cell) => (typeof cell === "string" ? sanitizeCsvCell(cell) : cell)));
    const csv = stringify([COLUMNS as unknown as string[], ...csvRows]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="transactions-export.csv"`);
    return res.send(csv);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow(COLUMNS as unknown as string[]);
  rows.forEach((r) => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => (col.width = 18));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="transactions-export.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
