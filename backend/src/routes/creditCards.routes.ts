import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createCreditCard,
  deleteCreditCard,
  getCreditCard,
  listCreditCards,
  payCreditCard,
  updateCreditCard,
} from "../controllers/creditCards.controller";

export const creditCardsRouter = Router();

creditCardsRouter.use(requireAuth);
creditCardsRouter.get("/", listCreditCards);
creditCardsRouter.post("/", createCreditCard);
creditCardsRouter.get("/:id", getCreditCard);
creditCardsRouter.put("/:id", updateCreditCard);
creditCardsRouter.delete("/:id", deleteCreditCard);
creditCardsRouter.post("/:id/pay", payCreditCard);
