import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  buyInvestment,
  createInvestment,
  deleteInvestment,
  getInvestment,
  listInvestments,
  sellInvestment,
  updatePrice,
} from "../controllers/investments.controller";

export const investmentsRouter = Router();

investmentsRouter.use(requireAuth);
investmentsRouter.get("/", listInvestments);
investmentsRouter.post("/", createInvestment);
investmentsRouter.get("/:id", getInvestment);
investmentsRouter.delete("/:id", deleteInvestment);
investmentsRouter.post("/:id/price", updatePrice);
investmentsRouter.post("/:id/buy", buyInvestment);
investmentsRouter.post("/:id/sell", sellInvestment);
