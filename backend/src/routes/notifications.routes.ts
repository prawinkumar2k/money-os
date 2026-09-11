import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listNotifications, markAllAsRead, markAsRead } from "../controllers/notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", listNotifications);
notificationsRouter.put("/:id/read", markAsRead);
notificationsRouter.put("/read-all", markAllAsRead);
