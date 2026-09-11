import { STORES, idbDelete, idbGetAll, idbPut } from "./db";
import { apiFetch } from "../api/client";

export interface OutboxEntry {
  id: string;
  method: "POST" | "PUT" | "DELETE";
  path: string;
  body: unknown;
  description: string; // human-readable, shown in the pending-sync UI
  createdAt: string;
  sequence: number; // tiebreaker for createdAt — see note below
  retryCount: number;
  status: "pending" | "failed";
  localTempId?: string; // for offline-created records, so the UI can reconcile once synced
}

const MAX_RETRIES = 5;

// createdAt has millisecond resolution, and two enqueues can genuinely land in the same
// millisecond (rapid offline actions, or just fast test execution). Sorting on createdAt alone
// then breaks ties on IndexedDB's default key order, which for a string `id` is lexicographic —
// not insertion order — silently reordering same-millisecond entries. This monotonic counter is
// the real tiebreaker; order is preserved regardless of timer resolution.
let sequenceCounter = 0;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueueMutation(entry: Omit<OutboxEntry, "id" | "createdAt" | "sequence" | "retryCount" | "status">): Promise<OutboxEntry> {
  const full: OutboxEntry = {
    ...entry,
    id: generateId(),
    createdAt: new Date().toISOString(),
    sequence: sequenceCounter++,
    retryCount: 0,
    status: "pending",
  };
  await idbPut(STORES.outbox, full);
  return full;
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await idbGetAll<OutboxEntry>(STORES.outbox);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sequence - b.sequence);
}

export async function removeFromOutbox(id: string): Promise<void> {
  await idbDelete(STORES.outbox, id);
}

let flushing = false;

/**
 * Replays queued offline mutations against the real API, in the order they were made. Stops at
 * the first failure (rather than skipping ahead) so dependent operations can't get reordered.
 * A mutation that keeps failing is never silently dropped — after MAX_RETRIES it's marked
 * "failed" and stays visible until the user retries or discards it.
 */
export async function flushOutbox(): Promise<{ synced: number; remaining: number }> {
  if (flushing) return { synced: 0, remaining: 0 };
  flushing = true;
  let synced = 0;

  try {
    const entries = await listOutbox();
    for (const entry of entries) {
      if (entry.status === "failed") continue;
      try {
        await apiFetch(entry.path, { method: entry.method, body: entry.body ? JSON.stringify(entry.body) : undefined });
        await removeFromOutbox(entry.id);
        synced += 1;
      } catch (err) {
        const retryCount = entry.retryCount + 1;
        const status = retryCount >= MAX_RETRIES ? "failed" : "pending";
        await idbPut(STORES.outbox, { ...entry, retryCount, status });
        if (status === "pending") break; // still offline or transient — stop, preserve order, try again later
      }
    }
  } finally {
    flushing = false;
  }

  const remaining = (await listOutbox()).length;
  return { synced, remaining };
}
