import { Response } from "express";
import { z } from "zod";
import { SyncJob } from "../models/SyncJob";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { runProviderSync } from "../services/syncEngine.service";

const syncSchema = z.object({
  provider: z.string().default("mock"),
});

export const startSync = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { provider: providerId } = syncSchema.parse(req.body ?? {});

  try {
    const { job } = await runProviderSync(req.userId!, providerId);
    res.json({ job });
  } catch {
    throw new HttpError(502, "Sync failed");
  }
});

export const getSyncStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const job = await SyncJob.findOne({ _id: req.params.jobId, userId: req.userId });
  if (!job) throw new HttpError(404, "Sync job not found");
  res.json({ job });
});
