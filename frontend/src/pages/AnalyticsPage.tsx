import { useEffect, useState } from "react";
import { AnalyticsData, AnalyticsPeriod, getAnalytics } from "../api/analytics";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All time" },
];

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span className="text-muted">₹{Math.round(value).toLocaleString("en-IN")}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--color-border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-primary)" }} />
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getAnalytics(period)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [period]);

  const maxCategory = data ? Math.max(1, ...data.spendingByCategory.map((c) => c.total)) : 1;
  const maxMerchant = data ? Math.max(1, ...data.spendingByMerchant.map((m) => m.total)) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Analytics</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={period === p.value ? "btn" : "btn btn-secondary"}
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {loading || !data ? (
        <p className="text-muted">Loading...</p>
      ) : (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Cash flow by month</h2>
            {data.cashFlow.length === 0 ? (
              <p className="text-muted">No data in this period.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr className="text-muted">
                    <th style={{ textAlign: "left" }}>Month</th>
                    <th style={{ textAlign: "right" }}>Income</th>
                    <th style={{ textAlign: "right" }}>Expenses</th>
                    <th style={{ textAlign: "right" }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cashFlow.map((row) => (
                    <tr key={row.month} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "6px 0" }}>{row.month}</td>
                      <td style={{ textAlign: "right", color: "var(--color-success)" }}>₹{row.income.toLocaleString("en-IN")}</td>
                      <td style={{ textAlign: "right", color: "var(--color-danger)" }}>₹{row.expenses.toLocaleString("en-IN")}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>₹{row.net.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Spending by category</h2>
              {data.spendingByCategory.length === 0 ? (
                <p className="text-muted">No spending in this period.</p>
              ) : (
                data.spendingByCategory.map((c) => <BarRow key={c.category} label={c.category} value={c.total} max={maxCategory} />)
              )}
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Top merchants</h2>
              {data.spendingByMerchant.length === 0 ? (
                <p className="text-muted">No spending in this period.</p>
              ) : (
                data.spendingByMerchant.map((m) => <BarRow key={m.merchant} label={m.merchant} value={m.total} max={maxMerchant} />)
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Savings rate trend</h2>
            {data.savingsRateTrend.length === 0 ? (
              <p className="text-muted">No data in this period.</p>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.savingsRateTrend.map((s) => (
                  <div key={s.month} className="card" style={{ padding: 10 }}>
                    <div className="text-muted" style={{ fontSize: 12 }}>{s.month}</div>
                    <div style={{ fontWeight: 700 }}>{s.savingsRate}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
