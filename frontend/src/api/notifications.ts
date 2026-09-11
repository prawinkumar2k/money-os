import { apiFetch } from "./client";

export interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  return apiFetch("/notifications");
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: "PUT" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/read-all", { method: "PUT" });
}
