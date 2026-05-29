"use client";

import { useCallback, useEffect, useState } from "react";

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

// `deps` (serialized into `depKey`) controls when a re-fetch happens. The
// effect calls the current render's `fetcher` directly, so the data always
// matches the deps that triggered the fetch — `fetcher` is intentionally kept
// out of the dependency list to avoid re-fetching on every render.
export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []): FetchState<T> {
  const [state, setState] = useState<InternalState<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  const depKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before async fetch
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((d) => {
        if (!cancelled) setState({ data: d, loading: false, error: null });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depKey captures the fetcher's inputs; nonce forces a manual reload
  }, [depKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data: state.data, loading: state.loading, error: state.error, reload };
}
