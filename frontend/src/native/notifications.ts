import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const isNative = Capacitor.isNativePlatform();

export async function areNotificationsAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return true;
    if (status.display === "denied") return false;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedules a single local reminder (e.g. a bill due date or budget threshold). Silently no-ops
 * on web or when permission isn't granted — there is no fake/simulated notification fallback.
 */
export async function scheduleReminder(options: { id: number; title: string; body: string; at: Date }): Promise<boolean> {
  if (!isNative) return false;
  const available = await areNotificationsAvailable();
  if (!available) return false;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: options.id,
        title: options.title,
        body: options.body,
        schedule: { at: options.at },
      },
    ],
  });
  return true;
}

export async function cancelReminder(id: number): Promise<void> {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id }] });
}
