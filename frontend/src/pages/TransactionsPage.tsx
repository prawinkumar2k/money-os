import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import {
  Transaction,
  createTransaction,
  deleteTransaction,
  deleteTransactionReceipt,
  listTransactions,
  setTransactionReceipt,
} from "../api/transactions";
import { useOnlineStatus } from "../offline/useOnlineStatus";
import { fetchWithCache } from "../offline/cache";
import { OutboxEntry, enqueueMutation, listOutbox } from "../offline/outbox";
import { capturePhoto, isCameraAvailable } from "../native/camera";
import { fileToCompressedDataUrl } from "../utils/imageCompress";

const SINGLE_LEG_TYPES = ["expense", "income", "refund", "fee", "cashback", "adjustment"];
const TRANSACTIONS_CACHE_KEY = "transactions:unfiltered:page1";

// A queued-but-unsynced transaction survives a reload in IndexedDB (see offline/outbox.ts), but
// the UI only showed it via transient React state set at creation time — reload while still
// offline and it silently vanished from view (the data was safe, just invisible). This rebuilds
// the same "pending sync" row from the persisted outbox entry so it's visible again.
function outboxEntryToTransaction(entry: OutboxEntry): Transaction | null {
  if (entry.method !== "POST" || entry.path !== "/transactions") return null;
  const body = entry.body as Record<string, unknown> | undefined;
  if (!body || typeof body.accountId !== "string") return null;

  return {
    _id: entry.localTempId ?? `pending-${entry.id}`,
    accountId: body.accountId,
    amount: typeof body.amount === "number" ? body.amount : 0,
    currency: "INR",
    date: typeof body.date === "string" ? body.date : entry.createdAt,
    description: typeof body.description === "string" ? body.description : "",
    merchant: (body.merchant as string | null) ?? null,
    category: null,
    subcategory: null,
    type: typeof body.type === "string" ? body.type : "expense",
    provider: "manual",
    isMockData: false,
    source: "manual",
    transferGroupId: null,
    receiptImage: null,
    pendingSync: true,
  };
}

export function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAccount, setFilterAccount] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState<"expense" | "income" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [showingCached, setShowingCached] = useState(false);
  const online = useOnlineStatus();

  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [nativeCameraAvailable, setNativeCameraAvailable] = useState(false);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const receiptTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    isCameraAvailable().then(setNativeCameraAvailable);
  }, []);

  const isUnfiltered = !filterAccount && !filterType && !search && page === 1;

  const refreshTransactions = useCallback(async () => {
    setLoading(true);
    try {
      if (isUnfiltered) {
        const { data, fromCache } = await fetchWithCache(TRANSACTIONS_CACHE_KEY, () =>
          listTransactions({ page, limit })
        );
        const pendingRows = (await listOutbox())
          .map(outboxEntryToTransaction)
          .filter((t): t is Transaction => t !== null);
        setTransactions([...pendingRows, ...data.transactions]);
        setTotal(data.pagination.total + pendingRows.length);
        setShowingCached(fromCache);
      } else {
        const result = await listTransactions({
          accountId: filterAccount || undefined,
          type: filterType || undefined,
          q: search || undefined,
          page,
          limit,
        });
        setTransactions(result.transactions);
        setTotal(result.pagination.total);
        setShowingCached(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [filterAccount, filterType, search, page, isUnfiltered]);

  useEffect(() => {
    listAccounts().then((a) => {
      setAccounts(a);
      if (a.length > 0) setAccountId((prev) => prev || a[0]._id);
    });
  }, []);

  useEffect(() => {
    refreshTransactions();
  }, [refreshTransactions]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const isoDate = new Date(date).toISOString();

      if (formTab === "transfer") {
        if (accountId === toAccountId) throw new Error("Choose two different accounts");
        if (!online) throw new Error("Transfers need both account balances updated together — connect to the internet to record one.");
        await createTransaction({
          type: "transfer",
          fromAccountId: accountId,
          toAccountId,
          amount: Math.abs(Number(amount)),
          date: isoDate,
          description,
        });
      } else {
        const signedAmount = formTab === "income" ? Math.abs(Number(amount)) : -Math.abs(Number(amount));
        const payload = {
          type: formTab,
          accountId,
          amount: signedAmount,
          date: isoDate,
          description,
          merchant: merchant || null,
        };

        if (online) {
          await createTransaction(payload);
        } else {
          // Offline: queue the write. It's persisted in IndexedDB (survives a reload while still
          // offline — see outboxEntryToTransaction) and shown as soon as refreshTransactions()
          // below re-reads the outbox, so "add transaction offline" is real, not just accepted
          // and forgotten in memory.
          await enqueueMutation({
            method: "POST",
            path: "/transactions",
            body: payload,
            description: `Add ${formTab}: ${description}`,
          });
        }
      }

      setAmount("");
      setDescription("");
      setMerchant("");
      setShowForm(false);
      if (online) setPage(1);
      await refreshTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddReceipt(id: string) {
    setError(null);
    if (nativeCameraAvailable) {
      setReceiptBusyId(id);
      try {
        const dataUrl = await capturePhoto();
        if (dataUrl) {
          await setTransactionReceipt(id, dataUrl);
          await refreshTransactions();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to attach receipt");
      } finally {
        setReceiptBusyId(null);
      }
      return;
    }
    // Web (or native without a camera): fall back to the browser's own file picker, which on a
    // phone browser opens the same camera/gallery chooser.
    receiptTargetIdRef.current = id;
    receiptFileInputRef.current?.click();
  }

  async function handleReceiptFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = receiptTargetIdRef.current;
    e.target.value = "";
    if (!file || !id) return;

    setReceiptBusyId(id);
    setError(null);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      await setTransactionReceipt(id, dataUrl);
      await refreshTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach receipt");
    } finally {
      setReceiptBusyId(null);
    }
  }

  async function handleRemoveReceipt(id: string) {
    setReceiptBusyId(id);
    setError(null);
    try {
      await deleteTransactionReceipt(id);
      await refreshTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove receipt");
    } finally {
      setReceiptBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this transaction?")) return;
    try {
      await deleteTransaction(id);
      await refreshTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete transaction");
    }
  }

  const accountName = (id: string) => accounts.find((a) => a._id === id)?.name ?? "—";
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Transactions</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add transaction"}
        </button>
      </div>

      <input
        ref={receiptFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleReceiptFileSelected}
      />

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {showingCached && <p className="text-muted" style={{ fontSize: 13 }}>Showing data saved from your last visit — you're offline.</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {(["expense", "income", "transfer"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={formTab === tab ? "btn" : "btn btn-secondary"}
                onClick={() => setFormTab(tab)}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div>
              <label className="text-muted" style={{ fontSize: 12 }}>
                Amount
              </label>
              <input className="input" type="number" step="0.01" required min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-muted" style={{ fontSize: 12 }}>
                Date
              </label>
              <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-muted" style={{ fontSize: 12 }}>
                {formTab === "transfer" ? "From account" : "Account"}
              </label>
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {formTab === "transfer" ? (
              <div>
                <label className="text-muted" style={{ fontSize: 12 }}>
                  To account
                </label>
                <select className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">Select...</option>
                  {accounts
                    .filter((a) => a._id !== accountId)
                    .map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-muted" style={{ fontSize: 12 }}>
                  Merchant
                </label>
                <input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Swiggy" />
              </div>
            )}
          </div>

          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Description
            </label>
            <input className="input" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <button className="btn" type="submit" disabled={saving || accounts.length === 0}>
            {saving ? "Saving..." : "Save transaction"}
          </button>
          {accounts.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>Create an account first.</p>}
        </form>
      )}

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select className="input" style={{ width: 180 }} value={filterAccount} onChange={(e) => { setFilterAccount(e.target.value); setPage(1); }}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="input" style={{ width: 160 }} value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {[...SINGLE_LEG_TYPES, "transfer"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Search description or merchant..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : transactions.length === 0 ? (
        <p className="text-muted">No transactions match these filters.</p>
      ) : (
        <div className="card">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {transactions.map((t) => (
                <tr key={t._id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "10px 0" }}>
                    {t.description}
                    {t.isMockData && <span className="badge" style={{ marginLeft: 8 }}>mock</span>}
                    {t.pendingSync && (
                      <span className="badge" style={{ marginLeft: 8, background: "var(--color-warning)" }}>pending sync</span>
                    )}
                  </td>
                  <td className="text-muted">{accountName(t.accountId)}</td>
                  <td className="text-muted">{t.category ?? "Uncategorized"}</td>
                  <td className="text-muted">{new Date(t.date).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right", color: t.amount < 0 ? "var(--color-danger)" : "var(--color-success)", fontWeight: 600 }}>
                    {t.amount < 0 ? "-" : "+"}₹{Math.abs(t.amount).toLocaleString("en-IN")}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!t.pendingSync && (
                      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                        {t.receiptImage ? (
                          <a href={t.receiptImage} target="_blank" rel="noreferrer" title="View receipt">
                            <img
                              src={t.receiptImage}
                              alt="Receipt"
                              style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, border: "1px solid var(--color-border)" }}
                            />
                          </a>
                        ) : null}
                        <button
                          onClick={() => (t.receiptImage ? handleRemoveReceipt(t._id) : handleAddReceipt(t._id))}
                          disabled={receiptBusyId === t._id}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 12 }}
                        >
                          {receiptBusyId === t._id ? "..." : t.receiptImage ? "Remove receipt" : "Add receipt"}
                        </button>
                        <button
                          onClick={() => handleDelete(t._id)}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <span className="text-muted" style={{ fontSize: 13 }}>
              {total} transaction{total === 1 ? "" : "s"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span className="text-muted" style={{ fontSize: 13, alignSelf: "center" }}>
                Page {page} of {totalPages}
              </span>
              <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
