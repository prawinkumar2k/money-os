import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getExpenseReport,
  getIncomeReport,
  getMonthlyReport,
  getTaxTransactionReport,
  getYearlyReport,
} from "../controllers/reports.controller";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.get("/monthly", getMonthlyReport);
reportsRouter.get("/yearly", getYearlyReport);
reportsRouter.get("/income", getIncomeReport);
reportsRouter.get("/expenses", getExpenseReport);
reportsRouter.get("/tax-transactions", getTaxTransactionReport);
