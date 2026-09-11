import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  cancelSubscription,
  confirmSubscription,
  dismissSubscription,
  listDetectedSubscriptions,
  listSubscriptions,
} from "../controllers/subscriptions.controller";

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth);
subscriptionsRouter.get("/", listSubscriptions);
subscriptionsRouter.get("/detected", listDetectedSubscriptions);
subscriptionsRouter.post("/confirm", confirmSubscription);
subscriptionsRouter.post("/dismiss", dismissSubscription);
subscriptionsRouter.post("/:id/cancel", cancelSubscription);
