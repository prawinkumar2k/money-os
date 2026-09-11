import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { __resetTokenCacheForTests } from "../api/client";

afterEach(async () => {
  cleanup();
  localStorage.clear();
  // The in-memory token cache and its "already hydrated" flag (api/client.ts) are module-level
  // state that would otherwise leak between tests in the same file — a later test's AuthProvider
  // mount would see hydrated=true and skip re-reading storage, keeping a stale cached token.
  __resetTokenCacheForTests();
  // fake-indexeddb persists across tests in the same file unless explicitly reset — each test
  // must start with an empty offline cache/outbox or earlier tests' cached data leaks in.
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("moneyos-offline");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});
