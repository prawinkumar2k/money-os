import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { exportTransactions } from "../controllers/export.controller";

export const exportRouter = Router();

exportRouter.use(requireAuth);
exportRouter.get("/transactions", exportTransactions);
