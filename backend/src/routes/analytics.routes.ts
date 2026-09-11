import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getAnalytics } from "../controllers/analytics.controller";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);
analyticsRouter.get("/", getAnalytics);
