import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardSummary, getDashboard } from "../api/accounts";

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card">
      <div className="text-muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted">Loading...</p>;
  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!summary) return null;

  const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        {summary.hasMockData && (
          <span className="badge" style={{ marginTop: 8 }}>
            Showing mock data — no real bank is connected
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Stat label="Net worth" value={rupee(summary.netWorth)} />
        <Stat label="Assets" value={rupee(summary.totalAssets)} color="var(--color-success)" />
        <Stat label="Liabilities" value={rupee(summary.totalLiabilities)} color="var(--color-danger)" />
        <Stat label="Bank balance" value={rupee(summary.bankBalance)} />
        <Stat label="Investments" value={rupee(summary.investmentsValue)} />
        <Stat label="Credit card owed" value={rupee(summary.creditCardOutstanding)} />
        <Stat label="Loan debt" value={rupee(summary.loanDebt)} />
        <Stat label="Accounts" value={String(summary.accountCount)} />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>This month</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
          <div>
            <div className="text-muted" style={{ fontSize: 13 }}>Income</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-success)" }}>{rupee(summary.monthlyIncome)}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 13 }}>Expenses</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-danger)" }}>{rupee(summary.monthlyExpenses)}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 13 }}>Savings</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{rupee(summary.monthlySavings)}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 13 }}>Savings rate</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.savingsRate}%</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Upcoming bills</h2>
          {summary.upcomingBills.length === 0 ? (
            <p className="text-muted">Nothing due in the next 7 days.</p>
          ) : (
            summary.upcomingBills.map((b) => (
              <div key={b._id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
                <span>{b.name}</span>
                <span className="text-muted">{rupee(b.amount)} · {new Date(b.dueDate).toLocaleDateString()}</span>
              </div>
            ))
          )}
          <Link to="/bills" style={{ fontSize: 13 }}>View all bills</Link>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Budgets</h2>
          {summary.budgets.length === 0 ? (
            <p className="text-muted">No budgets set up yet.</p>
          ) : (
            summary.budgets.map((b) => (
              <div key={b._id} style={{ fontSize: 14, padding: "6px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{b.category ?? "Overall"}</span>
                  <span className="text-muted">{b.percentageUsed}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--color-border)", marginTop: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, b.percentageUsed)}%`,
                      background: b.percentageUsed >= 90 ? "var(--color-danger)" : "var(--color-primary)",
                    }}
                  />
                </div>
              </div>
            ))
          )}
          <Link to="/budgets" style={{ fontSize: 13 }}>View all budgets</Link>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Goals</h2>
          {summary.goals.length === 0 ? (
            <p className="text-muted">No savings goals yet.</p>
          ) : (
            summary.goals.map((g) => (
              <div key={g._id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
                <span>{g.name}</span>
                <span className="text-muted">{g.progressPercentage}%</span>
              </div>
            ))
          )}
          <Link to="/goals" style={{ fontSize: 13 }}>View all goals</Link>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Recent transactions</h2>
        {summary.recentTransactions.length === 0 ? (
          <p className="text-muted">No transactions yet. Go to Accounts and sync to pull in some data.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {summary.recentTransactions.map((t) => (
                <tr key={t._id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 0" }}>
                    {t.description}
                    {t.isMockData && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        mock
                      </span>
                    )}
                  </td>
                  <td className="text-muted">{t.category ?? "Uncategorized"}</td>
                  <td className="text-muted">{new Date(t.date).toLocaleDateString()}</td>
                  <td
                    style={{
                      textAlign: "right",
                      color: t.amount < 0 ? "var(--color-danger)" : "var(--color-success)",
                      fontWeight: 600,
                    }}
                  >
                    {t.amount < 0 ? "-" : "+"}₹{Math.abs(t.amount).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
