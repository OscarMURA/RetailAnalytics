"use client";

import { useCallback, useRef, useState } from "react";
import { exportReport, type ExportOptions } from "@/lib/pdf";

/**
 * Drives the "Exportar" button: toggles the `report-exporting` class on the
 * report root (revealing export-only blocks and hiding interactive chrome),
 * lets the layout settle, then renders the sections into a branded PDF.
 */
export function useReportExport() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportPdf = useCallback(
    async (opts: ExportOptions) => {
      const root = rootRef.current;
      if (!root || exporting) return;
      setExporting(true);
      root.classList.add("report-exporting");
      // Two RAFs + a short delay so revealed blocks lay out and charts reflow.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      await new Promise((r) => setTimeout(r, 300));
      try {
        await exportReport(root, opts);
      } catch (err) {
        console.error("PDF export failed:", err);
      } finally {
        root.classList.remove("report-exporting");
        setExporting(false);
      }
    },
    [exporting],
  );

  return { rootRef, exporting, exportPdf };
}
