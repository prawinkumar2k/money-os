import { FormEvent, useCallback, useEffect, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import { AmortizationRow, Loan, createLoan, deleteLoan, getAmortizationSchedule, listLoans, payLoan } from "../api/loans";

export function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<AmortizationRow[]>([]);

  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [tenureMonths, setTenureMonths] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLoans(await listLoans());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load loans");
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
      await createLoan({
        name,
        principal: Number(principal),
        interestRate: Number(interestRate),
        tenureMonths: Number(tenureMonths),
        startDate: new Date().toISOString(),
        accountId: accountId || null,
      });
      setName("");
      setPrincipal("");
      setInterestRate("");
      setTenureMonths("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create loan");
    } finally {
      setSaving(false);
    }
  }

  async function handlePay(id: string) {
    try {
      await payLoan(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this loan?")) return;
    try {
      await deleteLoan(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete loan");
    }
  }

  async function toggleSchedule(id: string) {
    if (scheduleFor === id) {
      setScheduleFor(null);
      return;
    }
    const s = await getAmortizationSchedule(id);
    setSchedule(s);
    setScheduleFor(id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Loans</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add loan"}
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
              Name
            </label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Car Loan" />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Principal
            </label>
            <input className="input" type="number" required min="1" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Interest rate (annual %)
            </label>
            <input className="input" type="number" step="0.01" required min="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Tenure (months)
            </label>
            <input className="input" type="number" required min="1" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Payment account (optional)
            </label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Create loan"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : loans.length === 0 ? (
        <p className="text-muted">No loans yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {loans.map((l) => (
            <div key={l._id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{l.name}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {l.interestRate}% · {l.tenureMonths} months · EMI ₹{l.emi.toLocaleString("en-IN")}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(l._id)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                >
                  Delete
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 12, fontSize: 13 }}>
                <div>
                  <div className="text-muted">Remaining principal</div>
                  <div style={{ fontWeight: 600 }}>₹{l.remainingPrincipal.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-muted">Total paid</div>
                  <div style={{ fontWeight: 600 }}>₹{l.totalPaid.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-muted">Installments left</div>
                  <div style={{ fontWeight: 600 }}>{l.remainingInstallments}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => handlePay(l._id)} disabled={l.remainingPrincipal <= 0}>
                  Record payment (₹{l.emi.toLocaleString("en-IN")})
                </button>
                <button className="btn btn-secondary" onClick={() => toggleSchedule(l._id)}>
                  {scheduleFor === l._id ? "Hide schedule" : "View schedule"}
                </button>
              </div>

              {scheduleFor === l._id && (
                <div style={{ marginTop: 12, maxHeight: 240, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr className="text-muted">
                        <th style={{ textAlign: "left" }}>Month</th>
                        <th style={{ textAlign: "right" }}>EMI</th>
                        <th style={{ textAlign: "right" }}>Principal</th>
                        <th style={{ textAlign: "right" }}>Interest</th>
                        <th style={{ textAlign: "right" }}>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((row) => (
                        <tr key={row.month} style={{ borderTop: "1px solid var(--color-border)" }}>
                          <td>{row.month}</td>
                          <td style={{ textAlign: "right" }}>₹{row.emi.toLocaleString("en-IN")}</td>
                          <td style={{ textAlign: "right" }}>₹{row.principalComponent.toLocaleString("en-IN")}</td>
                          <td style={{ textAlign: "right" }}>₹{row.interestComponent.toLocaleString("en-IN")}</td>
                          <td style={{ textAlign: "right" }}>₹{row.remainingPrincipal.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
