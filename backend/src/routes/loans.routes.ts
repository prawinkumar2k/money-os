import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createLoan,
  deleteLoan,
  getAmortizationSchedule,
  getLoan,
  listLoans,
  payLoan,
} from "../controllers/loans.controller";

export const loansRouter = Router();

loansRouter.use(requireAuth);
loansRouter.get("/", listLoans);
loansRouter.post("/", createLoan);
loansRouter.get("/:id", getLoan);
loansRouter.delete("/:id", deleteLoan);
loansRouter.get("/:id/amortization-schedule", getAmortizationSchedule);
loansRouter.post("/:id/pay", payLoan);
