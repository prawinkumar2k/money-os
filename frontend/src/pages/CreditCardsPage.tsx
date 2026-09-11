import { FormEvent, useCallback, useEffect, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import { CreditCard, createCreditCard, deleteCreditCard, listCreditCards, payCreditCard } from "../api/creditCards";

export function CreditCardsPage() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payFromAccountId, setPayFromAccountId] = useState("");

  const [accountId, setAccountId] = useState("");
  const [statementDay, setStatementDay] = useState("1");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const creditCardAccounts = accounts.filter((a) => a.type === "credit_card");
  const nonCreditAccounts = accounts.filter((a) => a.type !== "credit_card");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await listCreditCards());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credit cards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    listAccounts().then((a) => {
      setAccounts(a);
      const firstNonCredit = a.find((x) => x.type !== "credit_card");
      if (firstNonCredit) setPayFromAccountId((prev) => prev || firstNonCredit._id);
    });
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCreditCard({
        accountId,
        statementDay: Number(statementDay),
        dueDate: new Date(dueDate).toISOString(),
      });
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create credit card");
    } finally {
      setSaving(false);
    }
  }

  async function handlePay(id: string) {
    try {
      await payCreditCard(id, payFromAccountId, Number(payAmount));
      setPayingId(null);
      setPayAmount("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pay card");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this credit card record? The linked account is not deleted.")) return;
    try {
      await deleteCreditCard(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Credit Cards</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add credit card"}
        </button>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="card"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}
        >
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Card account
            </label>
            <select className="input" required value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select...</option>
              {creditCardAccounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Statement day
            </label>
            <input className="input" type="number" min="1" max="31" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Next due date
            </label>
            <input className="input" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={saving || !accountId}>
            {saving ? "Saving..." : "Create"}
          </button>
          {creditCardAccounts.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13 }}>
              Create an account of type "credit card" first, on the Accounts page.
            </p>
          )}
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : cards.length === 0 ? (
        <p className="text-muted">No credit cards yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {cards.map((c) => (
            <div key={c._id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600 }}>{c.accountName}</div>
                {c.highUtilization && <span className="badge" style={{ background: "var(--color-danger)" }}>high utilization</span>}
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>₹{c.outstanding.toLocaleString("en-IN")} outstanding</span>
                  <span className="text-muted">of ₹{c.creditLimit.toLocaleString("en-IN")}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--color-border)", marginTop: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, c.utilizationPercent)}%`,
                      background: c.highUtilization ? "var(--color-danger)" : "var(--color-primary)",
                    }}
                  />
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {c.utilizationPercent}% utilized · ₹{c.availableCredit.toLocaleString("en-IN")} available
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Due {new Date(c.dueDate).toLocaleDateString()} · Min due ₹{c.minimumDue.toLocaleString("en-IN")}
                </div>
              </div>

              {payingId === c._id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  <select className="input" value={payFromAccountId} onChange={(e) => setPayFromAccountId(e.target.value)}>
                    {nonCreditAccounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <input className="input" type="number" step="0.01" placeholder="Amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" style={{ flex: 1 }} onClick={() => handlePay(c._id)}>
                      Pay
                    </button>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPayingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={() => setPayingId(c._id)}>
                    Pay card
                  </button>
                  <button
                    onClick={() => handleDelete(c._id)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                  >
                    Remove
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
