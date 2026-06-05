// Tiny in-memory cache for data GETs so navigating between pages doesn't
// re-query the warehouse every time. Keyed by logical query + deps; entries
// expire after a TTL and the whole cache is cleared when a recompute/reingest
// finishes (the underlying Parquet changed).

interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();

export const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 min

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/** Invalidate everything — call after the data is regenerated. */
export function clearApiCache(): void {
  store.clear();
}
