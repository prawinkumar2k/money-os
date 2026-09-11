import { FormEvent, useCallback, useEffect, useState } from "react";
import { Goal, addContribution, createGoal, deleteGoal, listGoals } from "../api/goals";
import { fetchWithCache } from "../offline/cache";

export function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showingCached, setShowingCached] = useState(false);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, fromCache } = await fetchWithCache("goals:list", listGoals);
      setGoals(data);
      setShowingCached(fromCache);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createGoal({
        name,
        targetAmount: Number(targetAmount),
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      });
      setName("");
      setTargetAmount("");
      setTargetDate("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this goal?")) return;
    try {
      await deleteGoal(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete goal");
    }
  }

  async function handleContribute(id: string) {
    const amount = Number(contributionAmount);
    if (!amount) return;
    try {
      await addContribution(id, amount);
      setContributingId(null);
      setContributionAmount("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contribution");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Savings Goals</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add goal"}
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
              Name
            </label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency Fund" />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Target amount
            </label>
            <input className="input" type="number" step="0.01" required min="1" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Target date (optional)
            </label>
            <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Create goal"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : goals.length === 0 ? (
        <p className="text-muted">No savings goals yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {goals.map((g) => (
            <div key={g._id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  {g.targetDate && (
                    <div className="text-muted" style={{ fontSize: 13 }}>
                      by {new Date(g.targetDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(g._id)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                >
                  Delete
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>₹{g.currentAmount.toLocaleString("en-IN")}</span>
                  <span className="text-muted">of ₹{g.targetAmount.toLocaleString("en-IN")}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--color-border)", marginTop: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${g.progressPercentage}%`, background: "var(--color-primary)" }} />
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {g.progressPercentage}% complete
                  {g.requiredMonthlyContribution !== null &&
                    ` · ₹${Math.round(g.requiredMonthlyContribution).toLocaleString("en-IN")}/month needed`}
                </div>
              </div>

              {contributingId === g._id ? (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="Amount (negative to withdraw)"
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                    autoFocus
                  />
                  <button className="btn" onClick={() => handleContribute(g._id)}>
                    Save
                  </button>
                  <button className="btn btn-secondary" onClick={() => setContributingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => setContributingId(g._id)}>
                  Add contribution
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
