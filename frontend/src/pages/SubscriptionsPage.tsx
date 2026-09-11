import { useCallback, useEffect, useState } from "react";
import {
  DetectedSubscription,
  Subscription,
  cancelSubscription,
  confirmSubscription,
  dismissSubscription,
  listDetectedSubscriptions,
  listSubscriptions,
} from "../api/subscriptions";

export function SubscriptionsPage() {
  const [detected, setDetected] = useState<DetectedSubscription[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [totals, setTotals] = useState({ monthly: 0, yearly: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [detectedList, confirmedList] = await Promise.all([listDetectedSubscriptions(), listSubscriptions()]);
      setDetected(detectedList);
      setSubscriptions(confirmedList.subscriptions);
      setTotals({ monthly: confirmedList.totalMonthlyCost, yearly: confirmedList.totalYearlyCost });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleConfirm(candidate: DetectedSubscription) {
    try {
      await confirmSubscription(candidate);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm subscription");
    }
  }

  async function handleDismiss(candidate: DetectedSubscription) {
    try {
      await dismissSubscription(candidate);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss subscription");
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this subscription? It stays in your history but stops counting toward totals.")) return;
    try {
      await cancelSubscription(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel subscription");
    }
  }

  if (loading) return <p className="text-muted">Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 style={{ margin: 0 }}>Subscriptions</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="card">
        <div className="text-muted" style={{ fontSize: 13 }}>
          Active subscriptions cost
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>
          ₹{Math.round(totals.monthly).toLocaleString("en-IN")}/mo · ₹{Math.round(totals.yearly).toLocaleString("en-IN")}/yr
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 16 }}>Detected — needs your confirmation</h2>
        <p className="text-muted" style={{ fontSize: 13, marginTop: -4 }}>
          These are guesses based on recurring transaction patterns, not confirmed facts. Confirm or dismiss each one.
        </p>
        {detected.length === 0 ? (
          <p className="text-muted">Nothing new detected.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {detected.map((d) => (
              <div key={d.merchant} className="card">
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  ~₹{d.amount.toLocaleString("en-IN")} {d.frequency} · {d.occurrences} charges seen
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>₹{Math.round(d.monthlyCost).toLocaleString("en-IN")}/mo estimated</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={() => handleConfirm(d)}>
                    Confirm
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleDismiss(d)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 16 }}>Your subscriptions</h2>
        {subscriptions.length === 0 ? (
          <p className="text-muted">No confirmed subscriptions yet.</p>
        ) : (
          <div className="card">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s._id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "10px 0" }}>
                      {s.name}
                      {s.status === "cancelled" && <span className="badge" style={{ marginLeft: 8 }}>cancelled</span>}
                    </td>
                    <td className="text-muted">{s.frequency}</td>
                    <td style={{ textAlign: "right" }}>₹{Math.round(s.monthlyCost).toLocaleString("en-IN")}/mo</td>
                    <td style={{ textAlign: "right" }}>
                      {s.status === "confirmed" && (
                        <button
                          onClick={() => handleCancel(s._id)}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
