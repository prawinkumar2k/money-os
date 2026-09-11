import { useCallback, useEffect, useState } from "react";
import {
  AvailableProvider,
  Connection,
  createConnection,
  disconnectConnection,
  listAvailableProviders,
  listConnections,
  reconnectConnection,
  syncConnection,
} from "../api/connections";

function statusBadge(status: Connection["status"]) {
  const map: Record<Connection["status"], { color: string; label: string }> = {
    connected: { color: "var(--color-success)", label: "Connected" },
    disconnected: { color: "var(--color-text-muted)", label: "Disconnected" },
    error: { color: "var(--color-danger)", label: "Error" },
    pending_authorization: { color: "var(--color-warning)", label: "Pending authorization" },
  };
  const { color, label } = map[status];
  return <span className="badge" style={{ background: color }}>{label}</span>;
}

export function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [available, setAvailable] = useState<AvailableProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [conns, avail] = await Promise.all([listConnections(), listAvailableProviders()]);
      setConnections(conns);
      setAvailable(avail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleConnect(providerId: string) {
    setBusyId(providerId);
    setError(null);
    try {
      await createConnection(providerId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSync(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await syncConnection(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReconnect(id: string) {
    setBusyId(id);
    try {
      await reconnectConnection(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconnect failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Disconnect this account? Sync will stop until you reconnect.")) return;
    setBusyId(id);
    try {
      await disconnectConnection(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ margin: 0 }}>Connected Accounts</h1>
      <p className="text-muted" style={{ fontSize: 13, marginTop: -12 }}>
        No real bank or Account Aggregator provider is wired up yet — only the development-only mock
        provider is available. A connection never shows "Connected" unless it actually is.
      </p>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : (
        <>
          {connections.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {connections.map((c) => (
                <div key={c._id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{c.provider}</div>
                    <div className="text-muted" style={{ fontSize: 13 }}>
                      {c.lastSyncedAt ? `Last synced ${new Date(c.lastSyncedAt).toLocaleString()}` : "Never synced"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {statusBadge(c.status)}
                    {c.status === "disconnected" ? (
                      <button className="btn" disabled={busyId === c._id} onClick={() => handleReconnect(c._id)}>
                        Reconnect
                      </button>
                    ) : (
                      <>
                        <button className="btn" disabled={busyId === c._id} onClick={() => handleSync(c._id)}>
                          Sync now
                        </button>
                        <button className="btn btn-secondary" disabled={busyId === c._id} onClick={() => handleDisconnect(c._id)}>
                          Disconnect
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {available.length > 0 && (
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Available providers</h2>
              {available.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ textTransform: "capitalize" }}>{p.id}</span>
                    {p.isMockData && <span className="badge">development only</span>}
                  </div>
                  <button className="btn" disabled={busyId === p.id} onClick={() => handleConnect(p.id)}>
                    Connect
                  </button>
                </div>
              ))}
            </div>
          )}

          {connections.length === 0 && available.length === 0 && (
            <p className="text-muted">No providers available.</p>
          )}
        </>
      )}
    </div>
  );
}
