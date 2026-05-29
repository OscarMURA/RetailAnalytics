"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { DataFilters, MetaResponse } from "@/lib/types";

const STORAGE_FILTERS = "ra.filters.v1";

const EMPTY_FILTERS: DataFilters = { stores: [], from: null, to: null };

function loadFilters(): DataFilters {
  try {
    const raw = localStorage.getItem(STORAGE_FILTERS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DataFilters>;
      return {
        stores: Array.isArray(parsed.stores) ? parsed.stores : [],
        from: typeof parsed.from === "string" ? parsed.from : null,
        to: typeof parsed.to === "string" ? parsed.to : null,
      };
    }
  } catch {}
  return EMPTY_FILTERS;
}

interface FiltersValue {
  filters: DataFilters;
  meta: MetaResponse | null;
  metaLoading: boolean;
  metaError: string | null;
  setStores: (stores: string[]) => void;
  setRange: (from: string | null, to: string | null) => void;
  reset: () => void;
  isActive: boolean;
}

const FiltersContext = createContext<FiltersValue | null>(null);

const isBrowser = typeof window !== "undefined";

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DataFilters>(() =>
    isBrowser ? loadFilters() : EMPTY_FILTERS,
  );
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_FILTERS, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    api
      .meta()
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((e: unknown) => {
        if (!cancelled) setMetaError(e instanceof Error ? e.message : "Error al cargar metadatos.");
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setStores = useCallback((stores: string[]) => {
    setFilters((f) => ({ ...f, stores }));
  }, []);

  const setRange = useCallback((from: string | null, to: string | null) => {
    setFilters((f) => ({ ...f, from, to }));
  }, []);

  const reset = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const isActive = filters.stores.length > 0 || filters.from !== null || filters.to !== null;

  const value = useMemo<FiltersValue>(
    () => ({ filters, meta, metaLoading, metaError, setStores, setRange, reset, isActive }),
    [filters, meta, metaLoading, metaError, setStores, setRange, reset, isActive],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters debe usarse dentro de <FiltersProvider>.");
  return ctx;
}
