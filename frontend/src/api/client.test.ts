import { describe, expect, it, beforeEach } from "vitest";
import { installMockFetch, jsonRoute } from "../test/mockFetch";
import { apiFetch, clearTokens, getAccessToken, hydrateTokens, setTokens } from "./client";

describe("apiFetch", () => {
  beforeEach(() => {
    clearTokens();
  });

  it("attaches the access token as a Bearer header when one is present", async () => {
    setTokens("access-1", "refresh-1");
    let capturedAuth: string | null = null;

    installMockFetch([
      {
        match: (url) => url.includes("/accounts"),
        respond: (_url, init) => {
          capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? null;
          return { status: 200, body: { accounts: [] } };
        },
      },
    ]);

    await apiFetch("/accounts");
    expect(capturedAuth).toBe("Bearer access-1");
  });

  it("on a 401, refreshes the token once and retries the original request", async () => {
    setTokens("stale-access", "refresh-1");
    const authHeadersSeen: (string | null)[] = [];

    installMockFetch([
      jsonRoute("/auth/refresh", "POST", 200, { accessToken: "fresh-access", refreshToken: "fresh-refresh" }),
      {
        match: (url) => url.includes("/accounts"),
        respond: (_url, init) => {
          const auth = (init?.headers as Record<string, string>)?.Authorization ?? null;
          authHeadersSeen.push(auth);
          // First call (stale token) fails with 401; retried call (fresh token) succeeds.
          if (auth === "Bearer stale-access") return { status: 401, body: { error: "Invalid token" } };
          return { status: 200, body: { accounts: [{ _id: "a1" }] } };
        },
      },
    ]);

    const result = await apiFetch("/accounts");
    expect(result.accounts).toHaveLength(1);
    expect(authHeadersSeen).toEqual(["Bearer stale-access", "Bearer fresh-access"]);
    expect(getAccessToken()).toBe("fresh-access");
  });

  it("clears tokens and surfaces the error when refresh itself fails", async () => {
    setTokens("stale-access", "dead-refresh");

    installMockFetch([
      jsonRoute("/auth/refresh", "POST", 401, { error: "Refresh token is no longer valid" }),
      jsonRoute("/accounts", "GET", 401, { error: "Invalid or expired access token" }),
    ]);

    await expect(apiFetch("/accounts")).rejects.toThrow("Invalid or expired access token");
    expect(getAccessToken()).toBeNull();
  });

  it("throws with the server's error message on a non-2xx, non-401 response", async () => {
    setTokens("access-1", "refresh-1");
    installMockFetch([jsonRoute("/budgets", "POST", 400, { error: "Amount must be positive" })]);

    await expect(apiFetch("/budgets", { method: "POST" })).rejects.toThrow("Amount must be positive");
  });
});

describe("token persistence (native/localStorage-backed, in-memory cache)", () => {
  beforeEach(() => {
    clearTokens();
  });

  it("persists tokens to localStorage on web, readable by a fresh hydration", async () => {
    setTokens("persisted-access", "persisted-refresh");
    expect(localStorage.getItem("moneyos.accessToken")).toBe("persisted-access");
    expect(localStorage.getItem("moneyos.refreshToken")).toBe("persisted-refresh");
  });

  it("hydrateTokens loads whatever is already in storage into the in-memory cache", async () => {
    localStorage.setItem("moneyos.accessToken", "from-storage-access");
    localStorage.setItem("moneyos.refreshToken", "from-storage-refresh");

    expect(getAccessToken()).toBeNull(); // cache is empty until hydrated
    await hydrateTokens();
    expect(getAccessToken()).toBe("from-storage-access");
  });

  it("clearTokens removes the persisted copy, not just the in-memory cache", async () => {
    setTokens("access-1", "refresh-1");
    clearTokens();
    expect(localStorage.getItem("moneyos.accessToken")).toBeNull();
    expect(localStorage.getItem("moneyos.refreshToken")).toBeNull();
  });
});
