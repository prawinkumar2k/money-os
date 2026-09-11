import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/auth";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div className="card">
          <p>Missing reset token.</p>
          <Link to="/forgot-password">Request a new reset link</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Choose a new password</h1>

        {done ? (
          <p style={{ color: "var(--color-success)", fontSize: 14 }}>Password updated. Redirecting to log in...</p>
        ) : (
          <>
            <input
              className="input"
              type="password"
              placeholder="New password (min 8 characters)"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {error && <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div>}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
