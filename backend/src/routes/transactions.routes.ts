import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createTransaction,
  deleteTransaction,
  deleteTransactionReceipt,
  getTransaction,
  listTransactions,
  setTransactionReceipt,
  updateTransaction,
} from "../controllers/transactions.controller";

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);
transactionsRouter.get("/", listTransactions);
transactionsRouter.post("/", createTransaction);
transactionsRouter.get("/:id", getTransaction);
transactionsRouter.put("/:id", updateTransaction);
transactionsRouter.delete("/:id", deleteTransaction);
transactionsRouter.put("/:id/receipt", setTransactionReceipt);
transactionsRouter.delete("/:id/receipt", deleteTransactionReceipt);
