import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  addContribution,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  updateGoal,
} from "../controllers/goals.controller";

export const goalsRouter = Router();

goalsRouter.use(requireAuth);
goalsRouter.get("/", listGoals);
goalsRouter.post("/", createGoal);
goalsRouter.get("/:id", getGoal);
goalsRouter.put("/:id", updateGoal);
goalsRouter.delete("/:id", deleteGoal);
goalsRouter.post("/:id/contributions", addContribution);
