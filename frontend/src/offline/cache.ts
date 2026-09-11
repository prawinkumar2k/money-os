import { STORES, idbGet, idbSet } from "./db";

interface CacheEntry<T> {
  data: T;
  updatedAt: string;
}

export async function readCache<T>(key: string): Promise<CacheEntry<T> | undefined> {
  return idbGet<CacheEntry<T>>(STORES.cache, key);
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  await idbSet<CacheEntry<T>>(STORES.cache, key, { data, updatedAt: new Date().toISOString() });
}

/**
 * Fetches fresh data and writes it to the cache; if the fetch fails (offline, or the server is
 * unreachable), falls back to whatever was last cached instead of showing a hard error — this is
 * the "view accounts/transactions/budgets/goals offline" requirement.
 */
export async function fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; fromCache: boolean; cachedAt: string | null }> {
  try {
    const data = await fetcher();
    await writeCache(key, data);
    return { data, fromCache: false, cachedAt: null };
  } catch (err) {
    const cached = await readCache<T>(key);
    if (cached) {
      return { data: cached.data, fromCache: true, cachedAt: cached.updatedAt };
    }
    throw err;
  }
}
