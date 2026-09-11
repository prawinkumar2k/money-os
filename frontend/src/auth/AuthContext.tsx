import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AuthUser, login as apiLogin, logout as apiLogout, register as apiRegister } from "../api/auth";
import { getAccessToken, hydrateTokens } from "../api/client";
import { isNative } from "../local/db";
import { isLocalAuthConfigured, setLocalPasscode, verifyLocalPasscode } from "../local/localAuth";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  ready: boolean;
  localAuthConfigured: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  // Native-only: the app's actual auth mechanism when there is no backend to talk to.
  setupPasscode: (passcode: string) => Promise<void>;
  unlockWithPasscode: (passcode: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [ready, setReady] = useState(false);
  const [localUnlocked, setLocalUnlocked] = useState(false);
  const [localAuthConfigured, setLocalAuthConfigured] = useState(false);

  useEffect(() => {
    if (isNative) {
      // Entirely local: no network call, no backend dependency. This is what lets the app open
      // and be used with the backend completely unreachable (PC off, no network) — see
      // readme.md's offline-architecture section. `ready` only waits on a local SQLite query.
      isLocalAuthConfigured()
        .then(setLocalAuthConfigured)
        .finally(() => setReady(true));
      return;
    }

    // Web: tokens live in an in-memory cache (see api/client.ts) backed by native/localStorage;
    // that persistent store is only readable asynchronously, so a session that survived an app
    // restart isn't known until this resolves. Render nothing auth-gated until it does, or a
    // returning user would flash the login page even though they're actually still logged in.
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
    if (isNative) {
      // Locks the app again; never deletes local financial data — this is a re-lock, not a
      // sign-out from an account that doesn't exist in the local-first model.
      setLocalUnlocked(false);
      return;
    }
    await apiLogout();
    setUser(null);
    setHasToken(false);
  }

  async function setupPasscode(passcode: string) {
    await setLocalPasscode(passcode);
    setLocalAuthConfigured(true);
    setLocalUnlocked(true);
  }

  async function unlockWithPasscode(passcode: string): Promise<boolean> {
    const ok = await verifyLocalPasscode(passcode);
    if (ok) setLocalUnlocked(true);
    return ok;
  }

  const isAuthenticated = isNative ? localUnlocked : hasToken;

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, ready, localAuthConfigured, login, register, logout, setupPasscode, unlockWithPasscode }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
