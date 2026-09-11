import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getSyncStatus, startSync } from "../controllers/sync.controller";

export const syncRouter = Router();

syncRouter.use(requireAuth);
syncRouter.post("/", startSync);
syncRouter.get("/:jobId/status", getSyncStatus);
