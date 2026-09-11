import * as tokenStorage from "../native/tokenStorage";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const ACCESS_TOKEN_KEY = "moneyos.accessToken";
const REFRESH_TOKEN_KEY = "moneyos.refreshToken";

// Every call site in the app (apiFetch, AuthContext, the offline outbox, the Sidebar's unread
// count, etc.) reads tokens synchronously — that's a lot of surface area to convert to async for
// what the underlying native storage plugin actually requires. Instead, an in-memory cache keeps
// the existing synchronous API, backed by real persistence: on native platforms that's
// @capacitor/preferences (UserDefaults/SharedPreferences), on web it's localStorage. hydrateTokens()
// populates the cache from that persistent store once, at app startup, before anything renders.
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let hydrated = false;

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function getRefreshToken(): string | null {
  return cachedRefreshToken;
}

export function setTokens(accessToken: string, refreshToken: string): void {
  cachedAccessToken = accessToken;
  cachedRefreshToken = refreshToken;
  void tokenStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  void tokenStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  void tokenStorage.removeItem(ACCESS_TOKEN_KEY);
  void tokenStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Reads both tokens from persistent storage into the in-memory cache. Call once at app startup, before rendering any auth-gated route, and await it. */
export async function hydrateTokens(): Promise<void> {
  if (hydrated) return;
  const [access, refresh] = await Promise.all([
    tokenStorage.getItem(ACCESS_TOKEN_KEY),
    tokenStorage.getItem(REFRESH_TOKEN_KEY),
  ]);
  cachedAccessToken = access;
  cachedRefreshToken = refresh;
  hydrated = true;
}

/** Test-only: resets the hydration/cache state between test cases. */
export function __resetTokenCacheForTests(): void {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  hydrated = false;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    return false;
  }

  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function apiFetch(path: string, options: RequestInit = {}, retry = true): Promise<any> {
  const accessToken = getAccessToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch(path, options, false);
    }
  }

  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "Request failed");
  }

  return body;
}
