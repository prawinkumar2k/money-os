import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { OutboxEntry, flushOutbox, listOutbox } from "./outbox";
import { isNative } from "../local/db";

/**
 * The REST-backed outbox/sync-on-reconnect flow below only applies to the web build, which talks
 * to a real backend and needs to queue writes made while offline. On native, every write already
 * goes straight into the on-device SQLite database (see local/transactions.ts) regardless of
 * WiFi/mobile-data status — there is nothing "waiting to sync" tied to network reachability, so
 * showing this banner there would be actively misleading (claiming a real problem that doesn't
 * exist) rather than just unnecessary.
 */
export function OfflineBanner() {
  if (isNative) return null;
  return <WebOfflineBanner />;
}

function WebOfflineBanner() {
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
