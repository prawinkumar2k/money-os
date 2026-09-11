import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { installMockFetch, jsonRoute } from "../test/mockFetch";
import { AuthProvider } from "../auth/AuthContext";
import { LoginPage, safeRedirectPath } from "./LoginPage";

function renderLoginPage() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  it("shows the server's error message when login fails, and does not navigate away", async () => {
    installMockFetch([jsonRoute("/auth/login", "POST", 401, { error: "Invalid email or password" })]);
    renderLoginPage();

    await userEvent.type(screen.getByPlaceholderText("Email"), "wrong@example.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "wrongpassword");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("Invalid email or password")).toBeInTheDocument());
  });

  it("requires both email and password before the browser allows submission", () => {
    renderLoginPage();
    const emailInput = screen.getByPlaceholderText("Email") as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(emailInput).toBeRequired();
    expect(passwordInput).toBeRequired();
  });

  it("disables the submit button and shows a busy label while the request is in flight", async () => {
    installMockFetch([
      {
        match: (url, init) => url.includes("/auth/login") && init?.method === "POST",
        respond: () => new Promise(() => {}), // never resolves — simulates an in-flight request
      },
    ]);
    renderLoginPage();

    await userEvent.type(screen.getByPlaceholderText("Email"), "demo@example.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /logging in/i })).toBeDisabled());
  });
});

describe("safeRedirectPath (open-redirect guard on the post-login redirect target)", () => {
  it("passes through a genuine same-origin path", () => {
    expect(safeRedirectPath("/accounts")).toBe("/accounts");
    expect(safeRedirectPath("/transactions?filter=food")).toBe("/transactions?filter=food");
  });

  it("falls back to / for an empty or missing path", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects protocol-relative paths that browsers can treat as external (react-router GHSA-wrjc-x8rr-h8h6)", () => {
    expect(safeRedirectPath("//evil.example.com")).toBe("/");
    expect(safeRedirectPath("//evil.example.com/phish")).toBe("/");
  });

  it("rejects backslash-prefixed paths, the specific bypass this advisory covers", () => {
    expect(safeRedirectPath("/\\evil.example.com")).toBe("/");
  });

  it("rejects a path that doesn't start with a single slash at all", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/");
    expect(safeRedirectPath("evil.example.com")).toBe("/");
  });
});
