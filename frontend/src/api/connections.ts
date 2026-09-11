import { apiFetch } from "./client";

export interface Connection {
  _id: string;
  provider: string;
  status: "connected" | "disconnected" | "error" | "pending_authorization";
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface AvailableProvider {
  id: string;
  isMockData: boolean;
}

export async function listConnections(): Promise<Connection[]> {
  const data = await apiFetch("/connections");
  return data.connections;
}

export async function listAvailableProviders(): Promise<AvailableProvider[]> {
  const data = await apiFetch("/connections/available-providers");
  return data.providers;
}

export async function createConnection(provider: string): Promise<Connection> {
  const data = await apiFetch("/connections", { method: "POST", body: JSON.stringify({ provider }) });
  return data.connection;
}

export async function syncConnection(id: string): Promise<{ status: string }> {
  const data = await apiFetch(`/connections/${id}/sync`, { method: "POST" });
  return data.job;
}

export async function reconnectConnection(id: string): Promise<Connection> {
  const data = await apiFetch(`/connections/${id}/reconnect`, { method: "POST" });
  return data.connection;
}

export async function disconnectConnection(id: string): Promise<Connection> {
  const data = await apiFetch(`/connections/${id}`, { method: "DELETE" });
  return data.connection;
}
