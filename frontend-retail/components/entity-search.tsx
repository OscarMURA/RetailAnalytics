"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/constants";
import type { RecommendationSearchItem } from "@/lib/types";

interface EntitySearchProps {
  mode: "product" | "customer";
  /** Id actualmente seleccionado (origen del recomendador). */
  selectedId?: string;
  /** Texto a mostrar para la selección actual cuando el campo está vacío. */
  selectedLabel?: string;
  onSelect: (id: string) => void;
  placeholder?: string;
}

/**
 * Buscador con autocompletado para elegir CUALQUIER producto o cliente como
 * origen del recomendador, por id, nombre o categoría/segmento — sin importar el
 * cluster. Con la caja vacía muestra el top por volumen (sugerencias por defecto).
 */
export function EntitySearch({
  mode,
  selectedId,
  selectedLabel,
  onSelect,
  placeholder,
}: EntitySearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecommendationSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Debounce + fetch. Solo consulta mientras el panel está abierto; al cerrarse
  // se cancela la petición en vuelo.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      api
        .recommendationSearch(mode, query.trim(), 20)
        .then((res) => {
          if (!cancelled) {
            setItems(res.items);
            setActive(0);
          }
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, mode, open]);

  // Cerrar al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Mantener visible la opción activa al navegar con el teclado.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (item: RecommendationSearchItem) => {
    onSelect(item.id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && items[active]) choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const unitLabel = mode === "product" ? "uds" : "uds";

  return (
    <div className="relative" ref={ref}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors",
          open
            ? "border-emerald-500 ring-2 ring-emerald-500/20"
            : "border-slate-200 hover:border-slate-300",
        )}
      >
        <Search size={15} className="shrink-0 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            placeholder ??
            (mode === "product"
              ? "Buscar producto por id, nombre o categoría…"
              : "Buscar cliente por id o segmento…")
          }
          className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          role="combobox"
          aria-expanded={open}
          aria-controls="entity-search-list"
        />
        {loading && open && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
        {query && !loading && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
            className="shrink-0 text-slate-400 hover:text-slate-600"
            aria-label="Limpiar búsqueda"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {!open && selectedLabel && (
        <p className="mt-1.5 truncate text-[11px] text-slate-400">
          Origen actual: <span className="font-medium text-slate-600">{selectedLabel}</span>
        </p>
      )}

      {open && (
        <div className="pop-in absolute left-0 right-0 z-50 mt-1.5 origin-top overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
          {!loading && items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-400">
              Sin coincidencias para “{query.trim()}”.
            </div>
          ) : (
            <ul ref={listRef} id="entity-search-list" role="listbox" className="max-h-72 overflow-y-auto py-1">
              {items.map((item, i) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(item);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                    i === active ? "bg-emerald-50" : "hover:bg-slate-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{item.label}</span>
                      {item.id === selectedId && (
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          actual
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">{item.sub}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-slate-700">
                      {formatNumber(item.units)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{unitLabel}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
