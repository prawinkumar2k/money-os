import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installMockFetch, jsonRoute } from "../test/mockFetch";
import { AuthProvider, useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";
import { getAccessToken } from "../api/client";

function Probe() {
  const { isAuthenticated, user, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="status">{isAuthenticated ? "in" : "out"}</div>
      <div data-testid="email">{user?.email ?? ""}</div>
      <button onClick={() => login("demo@example.com", "correct-horse-battery")}>Log in</button>
      <button onClick={() => logout()}>Log out</button>
    </div>
  );
}

describe("AuthContext", () => {
  it("transitions to authenticated after a successful login and stores tokens", async () => {
    installMockFetch([
      jsonRoute("/auth/login", "POST", 200, {
        user: { id: "u1", email: "demo@example.com", name: "Demo" },
        accessToken: "acc-1",
        refreshToken: "ref-1",
      }),
    ]);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("out");

    await userEvent.click(screen.getByText("Log in"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("in"));
    expect(screen.getByTestId("email")).toHaveTextContent("demo@example.com");
    expect(getAccessToken()).toBe("acc-1");
  });

  it("clears auth state and tokens on logout", async () => {
    installMockFetch([
      jsonRoute("/auth/login", "POST", 200, {
        user: { id: "u1", email: "demo@example.com", name: "Demo" },
        accessToken: "acc-1",
        refreshToken: "ref-1",
      }),
      jsonRoute("/auth/logout", "POST", 204, undefined),
    ]);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText("Log in"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("in"));

    await userEvent.click(screen.getByText("Log out"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("out"));
    expect(getAccessToken()).toBeNull();
  });

  it("RequireAuth redirects an unauthenticated user to /login (after token hydration resolves)", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <div>Secret dashboard</div>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // RequireAuth renders nothing until the async token hydration (native/localStorage) resolves.
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  });
});
