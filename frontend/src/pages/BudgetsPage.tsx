import { FormEvent, useCallback, useEffect, useState } from "react";
import { Category, listCategories } from "../api/categories";
import { Budget, createBudget, deleteBudget, listBudgets } from "../api/budgets";
import { fetchWithCache } from "../offline/cache";

function alertColor(level: Budget["alertLevel"]): string {
  if (level === 100) return "var(--color-danger)";
  if (level === 90) return "var(--color-danger)";
  if (level === 75) return "var(--color-warning)";
  if (level === 50) return "var(--color-warning)";
  return "var(--color-success)";
}

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<"weekly" | "monthly">("monthly");
  const [rollover, setRollover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showingCached, setShowingCached] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, fromCache } = await fetchWithCache("budgets:list", listBudgets);
      setBudgets(data);
      setShowingCached(fromCache);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    listCategories().then(setCategories);
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createBudget({
        category: category || null,
        amount: Number(amount),
        period,
        rollover,
      });
      setCategory("");
      setAmount("");
      setRollover(false);
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create budget");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this budget?")) return;
    try {
      await deleteBudget(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete budget");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Budgets</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add budget"}
        </button>
      </div>

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
              Category
            </label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Overall (all categories)</option>
              {categories.map((c) => (
                <option key={c._id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Amount
            </label>
            <input className="input" type="number" step="0.01" required min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Period
            </label>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as "weekly" | "monthly")}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
            Roll over unspent amount
          </label>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Create budget"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : budgets.length === 0 ? (
        <p className="text-muted">No budgets yet. Add one to start tracking spending against a limit.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {budgets.map((b) => (
            <div key={b._id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{b.category ?? "Overall"}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {b.period} {b.rollover && "· rollover"}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(b._id)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                >
                  Delete
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>₹{b.spent.toLocaleString("en-IN")} spent</span>
                  <span className="text-muted">of ₹{b.effectiveLimit.toLocaleString("en-IN")}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--color-border)", marginTop: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, b.percentageUsed)}%`,
                      background: alertColor(b.alertLevel),
                    }}
                  />
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {b.remaining >= 0
                    ? `₹${b.remaining.toLocaleString("en-IN")} remaining`
                    : `₹${Math.abs(b.remaining).toLocaleString("en-IN")} over budget`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
