import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getDashboard } from "../controllers/dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get("/", getDashboard);
