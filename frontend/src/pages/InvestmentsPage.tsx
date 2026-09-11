import { FormEvent, useCallback, useEffect, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import {
  Investment,
  buyInvestment,
  createInvestment,
  deleteInvestment,
  listInvestments,
  sellInvestment,
  updateInvestmentPrice,
} from "../api/investments";

const TYPES = ["stock", "mutual_fund", "etf", "gold", "fixed_deposit", "recurring_deposit", "other"];

export function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [totals, setTotals] = useState({ invested: 0, value: 0, pl: 0 });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState(TYPES[0]);
  const [currentPrice, setCurrentPrice] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const [tradeId, setTradeId] = useState<string | null>(null);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [tradeUnits, setTradeUnits] = useState("");
  const [tradePrice, setTradePrice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInvestments();
      setInvestments(data.investments);
      setTotals({ invested: data.totalInvested, value: data.totalCurrentValue, pl: data.totalProfitLoss });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load investments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    listAccounts().then(setAccounts);
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createInvestment({ name, type, currentPrice: Number(currentPrice), accountId: accountId || null });
      setName("");
      setCurrentPrice("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create investment");
    } finally {
      setSaving(false);
    }
  }

  async function handleTrade(id: string) {
    try {
      if (tradeMode === "buy") {
        await buyInvestment(id, Number(tradeUnits), Number(tradePrice));
      } else {
        await sellInvestment(id, Number(tradeUnits), Number(tradePrice));
      }
      setTradeId(null);
      setTradeUnits("");
      setTradePrice("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade failed");
    }
  }

  async function handleUpdatePrice(id: string) {
    const price = prompt("New manual price:");
    if (!price) return;
    try {
      await updateInvestmentPrice(id, Number(price));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update price");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this investment?")) return;
    try {
      await deleteInvestment(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Investments</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add investment"}
        </button>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <div className="card">
          <div className="text-muted" style={{ fontSize: 13 }}>Invested</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>₹{totals.invested.toLocaleString("en-IN")}</div>
        </div>
        <div className="card">
          <div className="text-muted" style={{ fontSize: 13 }}>Current value</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>₹{totals.value.toLocaleString("en-IN")}</div>
        </div>
        <div className="card">
          <div className="text-muted" style={{ fontSize: 13 }}>Profit / Loss</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: totals.pl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
            {totals.pl >= 0 ? "+" : ""}₹{totals.pl.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="card"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}
        >
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NIFTYBEES" />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>Current price (manual)</label>
            <input className="input" type="number" step="0.01" required min="0.01" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>Linked account (optional)</label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>{a.name}</option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Create"}
          </button>
        </form>
      )}

      <p className="text-muted" style={{ fontSize: 12, marginTop: -12 }}>
        No live market-data provider is connected — all prices are manually entered and clearly labeled as such.
      </p>

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : investments.length === 0 ? (
        <p className="text-muted">No investments yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {investments.map((inv) => (
            <div key={inv._id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{inv.name}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>{inv.type.replace("_", " ")} · {inv.units} units</div>
                </div>
                {inv.isManualPrice && <span className="badge">manual price</span>}
              </div>

              <div style={{ marginTop: 12, fontSize: 13 }}>
                <div>Current value: ₹{inv.currentValue.toLocaleString("en-IN")}</div>
                <div className="text-muted">Invested: ₹{inv.investedAmount.toLocaleString("en-IN")} @ avg ₹{inv.avgBuyPrice}</div>
                <div style={{ color: inv.profitLoss >= 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
                  {inv.profitLoss >= 0 ? "+" : ""}₹{inv.profitLoss.toLocaleString("en-IN")} ({inv.returnPercent}%)
                </div>
              </div>

              {tradeId === inv._id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className={tradeMode === "buy" ? "btn" : "btn btn-secondary"} style={{ flex: 1 }} onClick={() => setTradeMode("buy")}>Buy</button>
                    <button className={tradeMode === "sell" ? "btn" : "btn btn-secondary"} style={{ flex: 1 }} onClick={() => setTradeMode("sell")}>Sell</button>
                  </div>
                  <input className="input" type="number" placeholder="Units" value={tradeUnits} onChange={(e) => setTradeUnits(e.target.value)} />
                  <input className="input" type="number" placeholder="Price per unit" value={tradePrice} onChange={(e) => setTradePrice(e.target.value)} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" style={{ flex: 1 }} onClick={() => handleTrade(inv._id)}>Confirm</button>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setTradeId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => setTradeId(inv._id)}>Trade</button>
                  <button className="btn btn-secondary" onClick={() => handleUpdatePrice(inv._id)}>Update price</button>
                  <button
                    onClick={() => handleDelete(inv._id)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
