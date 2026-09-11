import { Response } from "express";
import { z } from "zod";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Import } from "../models/Import";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { ParsedCsvRow, buildImportPreview, parseCsv } from "../services/csvImport.service";
import { parsePdf } from "../services/pdfImport.service";
import { applyBalanceDelta } from "../services/transaction.service";
import { categorize } from "../services/categorization.service";

const previewSchema = z.object({
  accountId: z.string().min(1),
});

export const previewImport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = previewSchema.parse(req.body);
  if (!req.file) throw new HttpError(400, "No file uploaded (expected a CSV or PDF file in the 'file' field)");

  const account = await Account.findOne({ _id: body.accountId, userId: req.userId });
  if (!account) throw new HttpError(404, "Account not found");

  const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");

  let rows: ParsedCsvRow[];
  try {
    rows = isPdf ? await parsePdf(req.file.buffer) : parseCsv(req.file.buffer.toString("utf-8"));
  } catch (err) {
    throw new HttpError(400, `Could not parse this file: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  if (rows.length === 0) {
    throw new HttpError(
      400,
      isPdf
        ? "No transaction-like lines were found in this PDF — it may be a scanned/image-only statement, or use a layout this generic parser can't recognize"
        : "The CSV file has no data rows"
    );
  }

  const preview = await buildImportPreview(req.userId!, body.accountId, rows);
  res.json({
    filename: req.file.originalname,
    accountId: body.accountId,
    rowsTotal: preview.length,
    rowsWithErrors: preview.filter((r) => r.errors.length > 0).length,
    rowsDuplicate: preview.filter((r) => r.isDuplicate).length,
    rows: preview,
  });
});

const confirmSchema = z.object({
  accountId: z.string().min(1),
  filename: z.string().default("import.csv"),
  transactions: z
    .array(
      z.object({
        date: z.coerce.date(),
        description: z.string().min(1),
        merchant: z.string().nullable().optional(),
        amount: z.number(),
        category: z.string().nullable().optional(),
      })
    )
    .min(1)
    .max(2000, "Import at most 2000 transactions at a time — split larger statements into batches"),
  rowsSkippedDuplicate: z.number().default(0),
  rowsSkippedError: z.number().default(0),
  rowsTotal: z.number().default(0),
});

// User confirmation is mandatory: this endpoint only ever saves the exact rows the client sends
// after the user reviewed the preview — nothing is inserted from the raw file directly.
export const confirmImport = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = confirmSchema.parse(req.body);
  const userId = req.userId!;

  const account = await Account.findOne({ _id: body.accountId, userId });
  if (!account) throw new HttpError(404, "Account not found");

  let imported = 0;
  for (const row of body.transactions) {
    const category = row.category ?? (await categorize(userId, row.merchant ?? null, row.description));
    await Transaction.create({
      userId,
      accountId: body.accountId,
      amount: row.amount,
      date: row.date,
      description: row.description,
      merchant: row.merchant ?? null,
      category,
      type: row.amount >= 0 ? "income" : "expense",
      provider: "manual",
      isMockData: false,
      source: "imported",
    });
    await applyBalanceDelta(userId, body.accountId, row.amount);
    imported += 1;
  }

  const importRecord = await Import.create({
    userId,
    accountId: body.accountId,
    filename: body.filename,
    rowsTotal: body.rowsTotal || imported,
    rowsImported: imported,
    rowsSkippedDuplicate: body.rowsSkippedDuplicate,
    rowsSkippedError: body.rowsSkippedError,
  });

  res.status(201).json({ import: importRecord });
});

export const listImports = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const imports = await Import.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ imports });
});
