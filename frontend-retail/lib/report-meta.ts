import type { ReportMeta } from "@/lib/pdf";
import type { DataFilters } from "@/lib/types";

/** Build the PDF header chips (generated date + active global filters). */
export function filterMeta(filters: DataFilters): ReportMeta[] {
  return [
    { label: "Generado", value: new Date().toLocaleDateString("es-CO") },
    { label: "Tiendas", value: filters.stores.length ? filters.stores.join(", ") : "Todas" },
    {
      label: "Rango",
      value:
        filters.from || filters.to
          ? `${filters.from ?? "inicio"} → ${filters.to ?? "fin"}`
          : "Completo",
    },
  ];
}
