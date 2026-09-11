import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { OutboxEntry, flushOutbox, listOutbox } from "./outbox";

export function OfflineBanner() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refreshOutbox = useCallback(async () => {
    setPending(await listOutbox());
  }, []);

  useEffect(() => {
    refreshOutbox();
  }, [refreshOutbox]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      await flushOutbox();
      if (!cancelled) {
        await refreshOutbox();
        setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, refreshOutbox]);

  const failedCount = pending.filter((p) => p.status === "failed").length;

  if (online && pending.length === 0) return null;

  return (
    <div
      style={{
        padding: "8px 16px",
        background: online ? "var(--color-warning)" : "var(--color-danger)",
        color: "#fff",
        fontSize: 13,
        textAlign: "center",
      }}
    >
      {!online && "You're offline — changes you make will be saved and synced automatically when you're back online."}
      {online && syncing && "Syncing offline changes..."}
      {online && !syncing && pending.length > 0 && (
        <>
          {pending.length - failedCount > 0 && `${pending.length - failedCount} change(s) waiting to sync. `}
          {failedCount > 0 && `${failedCount} change(s) failed to sync and need attention.`}
        </>
      )}
    </div>
  );
}
