"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cacheGet, cacheSet, DEFAULT_TTL_MS } from "@/lib/api-cache";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface InternalState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface FetchOptions {
  /** When set, results are cached under `${cacheKey}|${deps}` and reused on
   *  re-mount/navigation. `reload()` always bypasses the cache (fresh fetch). */
  cacheKey?: string;
  ttlMs?: number;
}

// `deps` (serialized into `depKey`) controls when a re-fetch happens. The
// effect calls the current render's `fetcher` directly, so the data always
// matches the deps that triggered the fetch — `fetcher` is intentionally kept
// out of the dependency list to avoid re-fetching on every render.
export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: FetchOptions = {},
): FetchState<T> {
  const { cacheKey, ttlMs = DEFAULT_TTL_MS } = options;
  const depKey = JSON.stringify(deps);
  const fullKey = cacheKey ? `${cacheKey}|${depKey}` : null;

  const [state, setState] = useState<InternalState<T>>(() => {
    // Seed from cache synchronously so a cache hit renders without a flash.
    if (fullKey) {
      const cached = cacheGet<T>(fullKey);
      if (cached !== undefined) return { data: cached, loading: false, error: null };
    }
    return { data: null, loading: true, error: null };
  });
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const force = forceRef.current;
    forceRef.current = false;

    // Cache hit (and not a forced reload) → serve cached, skip the request.
    if (fullKey && !force) {
      const cached = cacheGet<T>(fullKey);
      if (cached !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- serve from cache
        setState({ data: cached, loading: false, error: null });
        return;
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before async fetch
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((d) => {
        if (cancelled) return;
        if (fullKey) cacheSet(fullKey, d, ttlMs);
        setState({ data: d, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : "Error desconocido.",
          }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depKey/fullKey capture inputs; nonce forces reload
  }, [depKey, fullKey, nonce]);

  const reload = useCallback(() => {
    forceRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { data: state.data, loading: state.loading, error: state.error, reload };
}
