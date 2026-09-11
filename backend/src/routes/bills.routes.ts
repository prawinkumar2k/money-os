import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createBill, deleteBill, getBill, listBills, payBill, updateBill } from "../controllers/bills.controller";

export const billsRouter = Router();

billsRouter.use(requireAuth);
billsRouter.get("/", listBills);
billsRouter.post("/", createBill);
billsRouter.get("/:id", getBill);
billsRouter.put("/:id", updateBill);
billsRouter.delete("/:id", deleteBill);
billsRouter.post("/:id/pay", payBill);
