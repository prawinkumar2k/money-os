import { apiFetch, clearTokens, setTokens } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export async function register(email: string, password: string, name: string): Promise<AuthUser> {
  const data = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    clearTokens();
  }
}

export async function forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
  return apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) });
}
