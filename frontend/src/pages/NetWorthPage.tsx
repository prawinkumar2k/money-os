import { useEffect, useState } from "react";
import { NetWorthSnapshot, NetWorthSummary, getNetWorth, getNetWorthHistory } from "../api/netWorth";

function HistoryChart({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  if (snapshots.length < 2) {
    return <p className="text-muted">Not enough history yet — check back after a few days of activity.</p>;
  }

  const width = 600;
  const height = 160;
  const values = snapshots.map((s) => s.netWorth);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const points = snapshots
    .map((s, i) => {
      const x = (i / (snapshots.length - 1)) * width;
      const y = height - ((s.netWorth - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Net worth history">
      <polyline points={points} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
    </svg>
  );
}

export function NetWorthPage() {
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getNetWorth(), getNetWorthHistory(90)])
      .then(([s, h]) => {
        setSummary(s);
        setHistory(h);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load net worth"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted">Loading...</p>;
  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!summary) return null;

  const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ margin: 0 }}>Net Worth</h1>

      <div className="card">
        <div className="text-muted" style={{ fontSize: 13 }}>Current net worth</div>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{rupee(summary.netWorth)}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13 }}>
          {summary.monthlyChange !== null && (
            <span className={summary.monthlyChange >= 0 ? "" : ""} style={{ color: summary.monthlyChange >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
              {summary.monthlyChange >= 0 ? "+" : ""}{rupee(summary.monthlyChange)} vs 30 days ago
            </span>
          )}
          {summary.yearlyChange !== null && (
            <span style={{ color: summary.yearlyChange >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
              {summary.yearlyChange >= 0 ? "+" : ""}{rupee(summary.yearlyChange)} vs 1 year ago
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>History (90 days)</h2>
        <HistoryChart snapshots={history} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <div className="card">
          <div className="text-muted" style={{ fontSize: 13 }}>Bank & cash</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{rupee(summary.breakdown.bankAndCashBalances)}</div>
        </div>
        <div className="card">
          <div className="text-muted" style={{ fontSize: 13 }}>Investments</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{rupee(summary.breakdown.investments)}</div>
        </div>
        <div className="card">
          <div className="text-muted" style={{ fontSize: 13 }}>Credit card debt</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-danger)" }}>{rupee(summary.breakdown.creditCardDebt)}</div>
        </div>
        <div className="card">
          <div className="text-muted" style={{ fontSize: 13 }}>Loan debt</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-danger)" }}>{rupee(summary.breakdown.loanDebt)}</div>
        </div>
      </div>
    </div>
  );
}
