import { FormEvent, useCallback, useEffect, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import { Bill, createBill, deleteBill, listBills, payBill } from "../api/bills";
import { cancelReminder, scheduleReminder } from "../native/notifications";

// Stable per-bill notification id: a bill's Mongo ObjectId hashed into a 31-bit int (required by
// the native scheduler's numeric id), so re-scheduling the same bill overwrites the prior reminder
// instead of stacking duplicates.
function billNotificationId(billId: string): number {
  let hash = 0;
  for (let i = 0; i < billId.length; i++) {
    hash = (hash * 31 + billId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

async function syncBillReminders(bills: Bill[]) {
  for (const bill of bills) {
    const id = billNotificationId(bill._id);
    if (!bill.active) {
      await cancelReminder(id);
      continue;
    }
    const remindAt = new Date(new Date(bill.dueDate).getTime() - bill.reminderDaysBefore * 86400000);
    if (remindAt.getTime() <= Date.now()) {
      await cancelReminder(id);
      continue;
    }
    await scheduleReminder({
      id,
      title: `${bill.name} is due soon`,
      body: `₹${bill.amount.toLocaleString("en-IN")} due ${new Date(bill.dueDate).toLocaleDateString()}`,
      at: remindAt,
    });
  }
}

function statusBadge(status: Bill["status"]) {
  const color =
    status === "overdue" ? "var(--color-danger)" : status === "due_soon" ? "var(--color-warning)" : "var(--color-text-muted)";
  const label = status === "overdue" ? "Overdue" : status === "due_soon" ? "Due soon" : "Upcoming";
  return (
    <span className="badge" style={{ background: color }}>
      {label}
    </span>
  );
}

export function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBills();
      setBills(data);
      syncBillReminders(data); // best-effort; no-ops on web / without notification permission
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    listAccounts().then((a) => {
      setAccounts(a);
      if (a.length > 0) setAccountId((prev) => prev || a[0]._id);
    });
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createBill({
        name,
        amount: Number(amount),
        accountId,
        frequency,
        dueDate: new Date(dueDate).toISOString(),
      });
      setName("");
      setAmount("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bill");
    } finally {
      setSaving(false);
    }
  }

  async function handlePay(id: string) {
    try {
      await payBill(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pay bill");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bill?")) return;
    try {
      await deleteBill(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bill");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Bills</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add bill"}
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
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electricity" />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Amount
            </label>
            <input className="input" type="number" step="0.01" required min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Pay from
            </label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Frequency
            </label>
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className="text-muted" style={{ fontSize: 12 }}>
              Next due date
            </label>
            <input className="input" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={saving || accounts.length === 0}>
            {saving ? "Saving..." : "Create bill"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : bills.length === 0 ? (
        <p className="text-muted">No bills yet.</p>
      ) : (
        <div className="card">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {bills.map((b) => (
                <tr key={b._id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "10px 0" }}>{b.name}</td>
                  <td className="text-muted">{b.frequency}</td>
                  <td>{statusBadge(b.status)}</td>
                  <td className="text-muted">{new Date(b.dueDate).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>₹{b.amount.toLocaleString("en-IN")}</td>
                  <td style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => handlePay(b._id)}>
                      Mark paid
                    </button>
                    <button
                      onClick={() => handleDelete(b._id)}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 12 }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
