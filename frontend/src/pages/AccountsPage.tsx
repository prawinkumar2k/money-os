import { FormEvent, useCallback, useEffect, useState } from "react";
import { Account, createAccount, deleteAccount, listAccounts, startSync } from "../api/accounts";
import { fetchWithCache } from "../offline/cache";
import { isNative } from "../local/db";

const ACCOUNT_TYPES = [
  "savings",
  "current",
  "salary",
  "credit_card",
  "cash",
  "upi",
  "investment",
  "loan",
  "fixed_deposit",
  "recurring_deposit",
  "custom",
];

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState("savings");
  const [balance, setBalance] = useState("0");
  const [creating, setCreating] = useState(false);
  const [showingCached, setShowingCached] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, fromCache } = await fetchWithCache("accounts:list", listAccounts);
      setAccounts(data);
      setShowingCached(fromCache);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await startSync("mock");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createAccount({ name, institution, type, balance: Number(balance) || 0 });
      setName("");
      setInstitution("");
      setType("savings");
      setBalance("0");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account and all its transactions? This cannot be undone.")) return;
    setError(null);
    try {
      await deleteAccount(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Accounts</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add account"}
          </button>
          {!isNative && (
            <button className="btn" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          )}
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 13, marginTop: -12 }}>
        {isNative
          ? "All accounts here are entered manually and stored only on this device — there is no bank/provider sync in the mobile app, since that would require a reachable server and a real Account Aggregator integration."
          : 'No real bank or Account Aggregator provider is connected yet — "Sync Now" pulls from a development-only mock provider so the app can be exercised end-to-end.'}
      </p>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {showingCached && <p className="text-muted" style={{ fontSize: 13 }}>Showing data saved from your last visit — you're offline.</p>}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="card"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}
        >
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Name
            </label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Institution
            </label>
            <input className="input" required value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Type
            </label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Opening balance
            </label>
            <input className="input" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="text-muted">{isNative ? "No accounts yet. Add one manually to get started." : 'No accounts yet. Add one manually or click "Sync Now" to pull in mock accounts.'}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {accounts.map((account) => (
            <div key={account._id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{account.name}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {account.institution} · {account.type.replace("_", " ")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {account.isMockData && <span className="badge">mock</span>}
                  {account.provider === "manual" && (
                    <button
                      className="btn-secondary"
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                      onClick={() => handleDelete(account._id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>
                ₹{account.balance.toLocaleString("en-IN")}
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {account.lastSyncedAt
                  ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString()}`
                  : "Never synced"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
