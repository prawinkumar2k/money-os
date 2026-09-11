import { Response } from "express";
import { Notification } from "../models/Notification";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { generateNotifications } from "../services/notification.service";

export const listNotifications = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await generateNotifications(req.userId!);
  const notifications = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
  const unreadCount = await Notification.countDocuments({ userId: req.userId, read: false });
  res.json({ notifications, unreadCount });
});

export const markAsRead = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const notification = await Notification.findOne({ _id: req.params.id, userId: req.userId });
  if (!notification) throw new HttpError(404, "Notification not found");
  notification.read = true;
  await notification.save();
  res.json({ notification });
});

export const markAllAsRead = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await Notification.updateMany({ userId: req.userId, read: false }, { $set: { read: true } });
  res.status(204).send();
});
