import { Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { buildBackup, restoreBackup, validateBackupShape } from "../services/backup.service";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Category } from "../models/Category";
import { Budget } from "../models/Budget";
import { Goal } from "../models/Goal";
import { Bill } from "../models/Bill";
import { Subscription } from "../models/Subscription";
import { CreditCard } from "../models/CreditCard";
import { Loan } from "../models/Loan";
import { Investment } from "../models/Investment";
import { AuditLog } from "../models/AuditLog";

export const createBackup = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const backup = await buildBackup(req.userId!);
  await AuditLog.create({ userId: req.userId, action: "backup.created", metadata: {}, ip: req.ip ?? null });

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="money-os-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(backup, null, 2));
});

const restoreSchema = z.object({
  backup: z.record(z.string(), z.unknown()),
});

export const restoreFromBackup = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = restoreSchema.parse(req.body);

  if (!validateBackupShape(body.backup)) {
    throw new HttpError(400, "This file doesn't look like a valid Money OS backup");
  }

  const result = await restoreBackup(req.userId!, body.backup);
  await AuditLog.create({ userId: req.userId, action: "backup.restored", metadata: result.restoredCounts, ip: req.ip ?? null });

  res.status(201).json(result);
});

// Deletes ALL of the requesting user's financial data (not the account itself) — used for a
// clean slate before restoring, or when the user wants to start over. Requires explicit
// confirmation from the client (a typed confirmation phrase) so it can never fire by accident.
const deleteAllSchema = z.object({
  confirmation: z.literal("DELETE ALL MY DATA"),
});

export const deleteAllData = asyncHandler(async (req: AuthedRequest, res: Response) => {
  deleteAllSchema.parse(req.body);
  const userId = req.userId!;

  await Promise.all([
    Account.deleteMany({ userId }),
    Transaction.deleteMany({ userId }),
    Category.deleteMany({ userId }),
    Budget.deleteMany({ userId }),
    Goal.deleteMany({ userId }),
    Bill.deleteMany({ userId }),
    Subscription.deleteMany({ userId }),
    CreditCard.deleteMany({ userId }),
    Loan.deleteMany({ userId }),
    Investment.deleteMany({ userId }),
  ]);

  await AuditLog.create({ userId, action: "data.deleted_all", metadata: {}, ip: req.ip ?? null });

  res.status(204).send();
});
