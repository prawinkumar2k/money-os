import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// The post-login redirect target comes from `location.state.from.pathname`, which RequireAuth
// populates from wherever the user was when redirected to /login — i.e. attacker-influenceable
// (a crafted link to a protected route). A path starting with "//" or "/\" is a known open-redirect
// vector (react-router advisory GHSA-wrjc-x8rr-h8h6): browsers can treat it as protocol-relative,
// sending a freshly-logged-in user straight to an external site. Only single-leading-slash,
// same-origin-looking paths are accepted; anything else falls back to the dashboard.
export function safeRedirectPath(path: string | undefined): string {
  if (!path) return "/";
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "/";
  return path;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const from = safeRedirectPath((location.state as { from?: Location })?.from?.pathname);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Log in to Money OS</h1>

        <input className="input" type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="input"
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div>}

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>

        <div className="text-muted" style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span>
            No account? <Link to="/register">Register</Link>
          </span>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </div>
  );
}
