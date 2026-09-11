import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setSubmitted(true);
      if (res.resetToken) {
        setDevResetLink(`/reset-password?token=${res.resetToken}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: 380, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Reset your password</h1>

        {submitted ? (
          <>
            <p className="text-muted" style={{ fontSize: 14 }}>
              If an account exists for that email, a reset link has been sent.
            </p>
            {devResetLink && (
              <div className="card" style={{ padding: 12 }}>
                <span className="badge">development only</span>
                <p style={{ fontSize: 13, marginBottom: 8 }}>
                  No email provider is configured yet, so here's the link directly:
                </p>
                <Link to={devResetLink}>{devResetLink}</Link>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              className="input"
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <div className="text-muted" style={{ fontSize: 13 }}>
          <Link to="/login">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
