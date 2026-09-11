import { useEffect, useState } from "react";
import { MonthlyReport, YearlyReport, getMonthlyReport, getYearlyReport } from "../api/reports";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ReportsPage() {
  const now = new Date();
  const [tab, setTab] = useState<"monthly" | "yearly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [yearlyReport, setYearlyReport] = useState<YearlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const request = tab === "monthly" ? getMonthlyReport(year, month) : getYearlyReport(year);
    request
      .then((r) => (tab === "monthly" ? setMonthlyReport(r as MonthlyReport) : setYearlyReport(r as YearlyReport)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [tab, year, month]);

  const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Reports</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={tab === "monthly" ? "btn" : "btn btn-secondary"} onClick={() => setTab("monthly")}>Monthly</button>
          <button className={tab === "yearly" ? "btn" : "btn btn-secondary"} onClick={() => setTab("yearly")}>Yearly</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {tab === "monthly" && (
          <select className="input" style={{ width: 120 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        )}
        <select className="input" style={{ width: 100 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : tab === "monthly" && monthlyReport ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 13 }}>Income</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-success)" }}>{rupee(monthlyReport.totalIncome)}</div>
            </div>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 13 }}>Expenses</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-danger)" }}>{rupee(monthlyReport.totalExpenses)}</div>
            </div>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 13 }}>Net savings</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{rupee(monthlyReport.netSavings)}</div>
            </div>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 13 }}>Transactions</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{monthlyReport.transactionCount}</div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Expenses by category</h2>
            {monthlyReport.byCategory.length === 0 ? (
              <p className="text-muted">No expenses this month.</p>
            ) : (
              monthlyReport.byCategory.map((c) => (
                <div key={c.category} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, borderTop: "1px solid var(--color-border)" }}>
                  <span>{c.category}</span>
                  <span style={{ fontWeight: 600 }}>{rupee(c.total)}</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : tab === "yearly" && yearlyReport ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 13 }}>Total income</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-success)" }}>{rupee(yearlyReport.totalIncome)}</div>
            </div>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 13 }}>Total expenses</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-danger)" }}>{rupee(yearlyReport.totalExpenses)}</div>
            </div>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 13 }}>Net savings</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{rupee(yearlyReport.netSavings)}</div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>By month</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr className="text-muted">
                  <th style={{ textAlign: "left" }}>Month</th>
                  <th style={{ textAlign: "right" }}>Income</th>
                  <th style={{ textAlign: "right" }}>Expenses</th>
                  <th style={{ textAlign: "right" }}>Savings</th>
                </tr>
              </thead>
              <tbody>
                {yearlyReport.months.map((m) => (
                  <tr key={m.month} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "6px 0" }}>{MONTH_NAMES[m.month - 1]}</td>
                    <td style={{ textAlign: "right" }}>{rupee(m.totalIncome)}</td>
                    <td style={{ textAlign: "right" }}>{rupee(m.totalExpenses)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{rupee(m.netSavings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
