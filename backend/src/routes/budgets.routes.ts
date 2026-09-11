import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createBudget,
  deleteBudget,
  getBudget,
  listBudgets,
  updateBudget,
} from "../controllers/budgets.controller";

export const budgetsRouter = Router();

budgetsRouter.use(requireAuth);
budgetsRouter.get("/", listBudgets);
budgetsRouter.post("/", createBudget);
budgetsRouter.get("/:id", getBudget);
budgetsRouter.put("/:id", updateBudget);
budgetsRouter.delete("/:id", deleteBudget);
