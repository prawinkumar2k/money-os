import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createBackup, deleteAllData, restoreFromBackup } from "../controllers/backup.controller";

export const backupRouter = Router();

backupRouter.use(requireAuth);
backupRouter.get("/", createBackup);
backupRouter.post("/restore", restoreFromBackup);
backupRouter.post("/delete-all", deleteAllData);
