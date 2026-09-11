const DB_NAME = "moneyos-offline";
const DB_VERSION = 1;

export const STORES = {
  cache: "cache", // key: resource name (e.g. "accounts"), value: { data, updatedAt }
  outbox: "outbox", // queued mutations made while offline
} as const;

// A fresh connection is opened per call rather than cached as a module-level singleton: IndexedDB
// opens are cheap, and caching a connection makes it stale the moment the database is deleted or
// recreated (e.g. in tests), with no clean way to invalidate the cache from outside this module.
// Each connection is explicitly closed once its transaction completes, so nothing lingers open.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.cache)) {
        db.createObjectStore(STORES.cache);
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        db.createObjectStore(STORES.outbox, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined; // private browsing / storage blocked — degrade to no cache rather than crash
  }
}

export async function idbSet<T>(store: string, key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // best-effort — offline caching is a convenience, not a guarantee
  }
}

// For stores created with an inline keyPath (e.g. STORES.outbox, keyPath "id") — put() must be
// called with just the value; passing an explicit key too (as idbSet does, for the keyless
// STORES.cache) throws synchronously. That earlier bug was masked by the try/catch here, which
// silently swallowed it — enqueueMutation appeared to succeed while writing nothing.
export async function idbPut<T>(store: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // best-effort — offline caching is a convenience, not a guarantee
  }
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function idbDelete(store: string, key: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // best-effort
  }
}
