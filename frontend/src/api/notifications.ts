import { apiFetch } from "./client";
import { isNative } from "../local/db";
import { listNotificationsLocal, markNotificationReadLocal, markAllNotificationsReadLocal } from "../local/notifications";

export interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  if (isNative) return listNotificationsLocal();
  return apiFetch("/notifications");
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isNative) return markNotificationReadLocal(id);
  await apiFetch(`/notifications/${id}/read`, { method: "PUT" });
}

export async function markAllNotificationsRead(): Promise<void> {
  if (isNative) return markAllNotificationsReadLocal();
  await apiFetch("/notifications/read-all", { method: "PUT" });
}
