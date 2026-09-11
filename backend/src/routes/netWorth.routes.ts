import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getNetWorth, getNetWorthHistory } from "../controllers/netWorth.controller";

export const netWorthRouter = Router();

netWorthRouter.use(requireAuth);
netWorthRouter.get("/", getNetWorth);
netWorthRouter.get("/history", getNetWorthHistory);
