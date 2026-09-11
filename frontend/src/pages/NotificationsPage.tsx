import { useCallback, useEffect, useState } from "react";
import { Notification, listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listNotifications();
      setNotifications(data.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    await refresh();
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    await refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Notifications</h1>
        <button className="btn btn-secondary" onClick={handleMarkAllRead}>Mark all read</button>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : notifications.length === 0 ? (
        <p className="text-muted">Nothing to notify you about right now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifications.map((n) => (
            <div
              key={n._id}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: n.read ? 0.6 : 1 }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{n.title}</div>
                <div className="text-muted" style={{ fontSize: 13 }}>{n.message}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</div>
              </div>
              {!n.read && (
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => handleMarkRead(n._id)}>
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
