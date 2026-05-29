"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

// `deps` controls when a re-fetch happens; the latest `fetcher` is always used
// via a ref without forcing it into the dependency list. The synchronous
// loading reset at the start of the effect is the standard fetch-in-effect
// pattern (React Compiler's heuristic flags it as a false positive here).
export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []): FetchState<T> {
  const [state, setState] = useState<InternalState<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  const fetcherRef = useRef(fetcher);
  const depKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before async fetch
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef
      .current()
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
  }, [depKey, nonce]);

  // Keep the ref pointed at the latest fetcher after each render.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data: state.data, loading: state.loading, error: state.error, reload };
}
