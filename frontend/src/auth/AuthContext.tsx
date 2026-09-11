import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AuthUser, login as apiLogin, logout as apiLogout, register as apiRegister } from "../api/auth";
import { getAccessToken, hydrateTokens } from "../api/client";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [ready, setReady] = useState(false);

  // Tokens live in an in-memory cache (see api/client.ts) backed by native/localStorage; that
  // persistent store is only readable asynchronously, so a session that survived an app restart
  // isn't known until this resolves. Render nothing auth-gated until it does, or a returning user
  // would flash the login page even though they're actually still logged in.
  useEffect(() => {
    hydrateTokens().then(() => {
      setHasToken(Boolean(getAccessToken()));
      setReady(true);
    });
  }, []);

  async function login(email: string, password: string) {
    const authedUser = await apiLogin(email, password);
    setUser(authedUser);
    setHasToken(true);
  }

  async function register(email: string, password: string, name: string) {
    const authedUser = await apiRegister(email, password, name);
    setUser(authedUser);
    setHasToken(true);
  }

  async function logout() {
    await apiLogout();
    setUser(null);
    setHasToken(false);
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: hasToken, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
