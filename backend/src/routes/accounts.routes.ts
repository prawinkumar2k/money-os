import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from "../controllers/accounts.controller";

export const accountsRouter = Router();

accountsRouter.use(requireAuth);
accountsRouter.get("/", listAccounts);
accountsRouter.post("/", createAccount);
accountsRouter.get("/:id", getAccount);
accountsRouter.put("/:id", updateAccount);
accountsRouter.delete("/:id", deleteAccount);
