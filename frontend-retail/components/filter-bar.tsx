"use client";

import { useEffect, useRef, useState } from "react";
import { Store, Calendar as CalendarIcon, ChevronDown, X, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters } from "@/lib/filters";

function StoreMultiSelect() {
  const { filters, meta, setStores } = useFilters();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const stores = meta?.stores ?? [];
  const selected = filters.stores;
  const storeLabel = (id: string) => `Tienda ${id}`;
  const label =
    selected.length === 0
      ? "Todas las tiendas"
      : selected.length === 1
        ? storeLabel(selected[0])
        : `${selected.length} tiendas`;

  const toggle = (id: string) => {
    setStores(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!stores.length}
        className={cn(
          "inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50",
          selected.length
            ? "border-emerald-400/40 text-emerald-200 bg-emerald-400/10"
            : "border-white/15 text-slate-200 bg-white/5 hover:bg-white/10 hover:text-white",
        )}
      >
        <Store size={14} className="shrink-0" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={14} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white shadow-pop p-1.5 pop-in origin-top-right">
          <div className="px-2 py-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Tiendas
            </span>
            {selected.length > 0 && (
              <button
                onClick={() => setStores([])}
                className="text-[11px] text-slate-400 hover:text-slate-700 font-medium"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {stores.map((id) => {
              const checked = selected.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded border grid place-items-center shrink-0",
                      checked ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300",
                    )}
                  >
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{storeLabel(id)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DateRange() {
  const { filters, meta, setRange } = useFilters();
  const min = meta?.dateMin;
  const max = meta?.dateMax;
  return (
    <div className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border border-white/15 bg-white/5">
      <CalendarIcon size={14} className="text-slate-400 shrink-0" />
      <input
        type="date"
        aria-label="Desde"
        value={filters.from ?? ""}
        min={min}
        max={filters.to ?? max}
        onChange={(e) => setRange(e.target.value || null, filters.to)}
        className="bg-transparent text-slate-200 text-xs sm:text-sm focus:outline-none w-[116px] tabular-nums [color-scheme:dark]"
      />
      <span className="text-slate-500">→</span>
      <input
        type="date"
        aria-label="Hasta"
        value={filters.to ?? ""}
        min={filters.from ?? min}
        max={max}
        onChange={(e) => setRange(filters.from, e.target.value || null)}
        className="bg-transparent text-slate-200 text-xs sm:text-sm focus:outline-none w-[116px] tabular-nums [color-scheme:dark]"
      />
    </div>
  );
}

export function FilterBar() {
  const { isActive, reset, metaError } = useFilters();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StoreMultiSelect />
      <DateRange />
      {isActive && (
        <button
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-red-300 hover:bg-red-400/10 transition-colors"
        >
          <X size={13} />
          Limpiar filtros
        </button>
      )}
      {metaError && <span className="text-[11px] text-amber-300">Filtros no disponibles</span>}
    </div>
  );
}
