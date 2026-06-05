"use client";

import { useCallback, useState } from "react";
import { Package, Users, Calendar, Filter, BarChart3, TrendingUp, TrendingDown, Minus, DatabaseZap } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Card, CardHeader, Badge, KpiCard, Segmented } from "@/components/ui";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/states";
import { HorizontalBars } from "@/components/charts/horizontal-bars";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { CategoriesDonut } from "@/components/charts/categories-donut";
import { PeakTimeseries } from "@/components/charts/peak-timeseries";
import { useFetch } from "@/lib/use-fetch";
import { useReportExport } from "@/lib/use-report-export";
import { JobButton } from "@/components/job-button";
import { useFilters } from "@/lib/filters";
import { filterMeta } from "@/lib/report-meta";
import { api } from "@/lib/api";
import { PALETTE, CHART_COLORS, MONTHS_ES, formatNumber } from "@/lib/constants";
import type { CustomerSortBy } from "@/lib/types";

const WEEKDAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatPeakDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
}

export default function DashboardPage() {
  const { filters } = useFilters();
  const fkey = JSON.stringify(filters);

  const [customerBy, setCustomerBy] = useState<CustomerSortBy>("transactions");
  const [peakView, setPeakView] = useState<"heatmap" | "series">("heatmap");
  const { rootRef, exporting, exportPdf } = useReportExport();

  const kpis = useFetch(() => api.kpis(filters), [fkey], { cacheKey: "kpis" });
  const products = useFetch(() => api.topProducts(10, filters), [fkey], { cacheKey: "topProducts" });
  const customers = useFetch(() => api.topCustomers(10, customerBy, filters), [fkey, customerBy], {
    cacheKey: "topCustomers",
  });
  const calendar = useFetch(() => api.calendar(90, filters), [fkey], { cacheKey: "calendar" });
  const peak = useFetch(() => api.peakTimeseries(filters), [fkey], { cacheKey: "peak" });
  const categories = useFetch(() => api.categories(filters), [fkey], { cacheKey: "categories" });
  const coverage = useFetch(() => api.coverage(filters), [fkey], { cacheKey: "coverage" });

  const reloadAll = useCallback(() => {
    kpis.reload();
    products.reload();
    customers.reload();
    calendar.reload();
    peak.reload();
    categories.reload();
    coverage.reload();
  }, [kpis, products, customers, calendar, peak, categories, coverage]);

  const trendPct = calendar.data?.trend30.pct ?? 0;
  const trendDir = calendar.data?.trend30.direction ?? "flat";
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  const trendColor =
    trendDir === "up" ? "text-emerald-700" : trendDir === "down" ? "text-red-700" : "text-slate-600";

  const customerUnit = customerBy === "units" ? "unidades" : "transacciones";

  const handleExport = () =>
    exportPdf({
      title: "Resumen ejecutivo",
      eyebrow: "Dashboard",
      subtitle: "Visión consolidada del comportamiento transaccional de supermercado.",
      filename: "RetailAnalytics-ResumenEjecutivo.pdf",
      meta: filterMeta(filters),
    });

  return (
    <div className="view-enter" ref={rootRef}>
      <PageHeader
        eyebrow="Dashboard"
        title="Resumen ejecutivo"
        subtitle="Visión consolidada del comportamiento transaccional. Usa los filtros para acotar por tienda y rango de fechas."
        onRefresh={reloadAll}
        onExport={handleExport}
        exporting={exporting}
        actions={
          <JobButton
            kind="reingest"
            idleLabel="Actualizar consultas"
            runningVerb="Actualizando"
            icon={DatabaseZap}
            onDone={reloadAll}
            title="Reingesta el dataset completo con Spark (ETL: extract → clean → modelos) y vuelve a consultar."
          />
        }
        showFilters
      />

      {/* KPIs */}
      <section data-report-section className="mb-6">
        {kpis.loading ? (
          <LoadingBlock height={140} />
        ) : kpis.error ? (
          <ErrorBlock message={kpis.error} onRetry={kpis.reload} height={140} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
            {kpis.data?.kpis.map((k) => (
              <KpiCard key={k.key} kpi={k} />
            ))}
          </div>
        )}
      </section>

      {/* Top productos / clientes */}
      <section data-report-section className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 mb-6">
        <Card accent>
          <CardHeader
            icon={<Package size={16} />}
            title="Top 10 productos"
            subtitle="Unidades vendidas en el período"
            right={<Badge tone="slate">por volumen</Badge>}
          />
          {products.loading ? (
            <LoadingBlock />
          ) : products.error ? (
            <ErrorBlock message={products.error} onRetry={products.reload} />
          ) : !products.data?.length ? (
            <EmptyBlock />
          ) : (
            <HorizontalBars
              data={products.data.map((p) => ({ label: p.label, value: p.units, category: p.category }))}
              color={PALETTE.emerald600}
            />
          )}
        </Card>
        <Card accent>
          <CardHeader
            icon={<Users size={16} />}
            title="Top 10 clientes"
            subtitle={`IDs anonimizados · ordenados por ${customerUnit}`}
            right={
              <Segmented
                value={customerBy}
                onChange={setCustomerBy}
                options={[
                  { value: "transactions", label: "Transacciones" },
                  { value: "units", label: "Unidades" },
                ]}
              />
            }
          />
          {customers.loading ? (
            <LoadingBlock />
          ) : customers.error ? (
            <ErrorBlock message={customers.error} onRetry={customers.reload} />
          ) : !customers.data?.length ? (
            <EmptyBlock />
          ) : (
            <HorizontalBars
              data={customers.data.map((c) => ({
                label: c.id,
                value: customerBy === "units" ? c.units : c.transactions,
              }))}
              color={PALETTE.teal500}
            />
          )}
        </Card>
      </section>

      {/* Días pico: heatmap / serie */}
      <section data-report-section className="mb-6">
        <Card accent>
          <CardHeader
            icon={<Calendar size={16} />}
            title="Días pico de compra"
            subtitle="Intensidad transaccional en el período"
            right={
              <Segmented
                value={peakView}
                onChange={setPeakView}
                options={[
                  { value: "heatmap", label: "Heatmap" },
                  { value: "series", label: "Serie" },
                ]}
              />
            }
          />
          {peakView === "heatmap" ? (
            calendar.loading ? (
              <LoadingBlock height={220} />
            ) : calendar.error ? (
              <ErrorBlock message={calendar.error} onRetry={calendar.reload} height={220} />
            ) : !calendar.data?.days.length ? (
              <EmptyBlock height={220} />
            ) : (
              <>
                <CalendarHeatmap data={calendar.data.days} />
                <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                      Día más activo
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {calendar.data.peakDay ? formatPeakDay(calendar.data.peakDay.date) : "—"}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {calendar.data.peakDay ? `${formatNumber(calendar.data.peakDay.count)} transacciones` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                      Promedio diario
                    </div>
                    <div className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatNumber(Math.round(calendar.data.dailyAvg))} transacciones
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                      Tendencia 30d
                    </div>
                    <div className={`text-sm font-semibold inline-flex items-center gap-1 ${trendColor}`}>
                      <TrendIcon size={14} /> {trendPct > 0 ? "+" : ""}
                      {trendPct.toFixed(1)}% MoM
                    </div>
                    <div className="text-xs text-slate-500">vs período anterior</div>
                  </div>
                </div>
              </>
            )
          ) : peak.loading ? (
            <LoadingBlock height={300} />
          ) : peak.error ? (
            <ErrorBlock message={peak.error} onRetry={peak.reload} height={300} />
          ) : !peak.data?.points.length ? (
            <EmptyBlock height={300} />
          ) : (
            <>
              <PeakTimeseries data={peak.data} />
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Top 5 días con mayor número de transacciones
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Solo en el PDF: datos del heatmap de días pico */}
      {peak.data?.top5?.length ? (
        <section data-report-section className="export-only mb-6">
          <Card accent>
            <CardHeader
              icon={<Calendar size={16} />}
              title="Días pico — detalle"
              subtitle="Top días por número de transacciones (datos del heatmap)"
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-4 font-semibold">#</th>
                  <th className="py-2 px-4 font-semibold">Día</th>
                  <th className="py-2 pl-4 font-semibold text-right">Transacciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {peak.data.top5.map((d, i) => {
                  const pt = peak.data!.points.find((p) => p.date === d);
                  return (
                    <tr key={d} className="text-slate-700">
                      <td className="py-2.5 pr-4 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">{formatPeakDay(d)}</td>
                      <td className="py-2.5 pl-4 text-right tabular-nums">{formatNumber(pt?.transactions ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}

      {/* Categorías: donut + ranking */}
      <section data-report-section className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <Card accent className="xl:col-span-2">
          <CardHeader
            icon={<Filter size={16} />}
            title="Top categorías por volumen"
            subtitle="Participación porcentual sobre el total de unidades vendidas"
          />
          {categories.loading ? (
            <LoadingBlock height={260} />
          ) : categories.error ? (
            <ErrorBlock message={categories.error} onRetry={categories.reload} height={260} />
          ) : !categories.data?.items.length ? (
            <EmptyBlock height={260} />
          ) : (
            <CategoriesDonut data={categories.data.items.slice(0, 8)} activeCount={categories.data.activeCount} />
          )}
        </Card>
        <Card accent>
          <CardHeader title="Resumen de cobertura" subtitle="Diversidad del portafolio" />
          {coverage.loading ? (
            <LoadingBlock height={260} />
          ) : coverage.error ? (
            <ErrorBlock message={coverage.error} onRetry={coverage.reload} height={260} />
          ) : !coverage.data ? (
            <EmptyBlock height={260} />
          ) : (
            <div className="space-y-4">
              {[
                {
                  label: "Categorías activas",
                  value: formatNumber(coverage.data.activeCategories),
                  hint: `/ ${formatNumber(coverage.data.totalCategories)} disponibles`,
                },
                {
                  label: "Productos rotando",
                  value: formatNumber(coverage.data.rotatingProducts),
                  hint: "al menos 1 venta",
                },
                {
                  label: "Tiendas activas",
                  value: formatNumber(coverage.data.activeStores),
                  hint: "en el período",
                },
                {
                  label: "Ticket medio",
                  value: coverage.data.avgTicket.toFixed(1),
                  hint: "unidades / transacción",
                },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-end justify-between pb-3 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <div className="text-xs text-slate-500 font-medium">{r.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{r.hint}</div>
                  </div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{r.value}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Ranking de categorías (top 15) */}
      <section data-report-section className="mb-2">
        <Card accent>
          <CardHeader
            icon={<BarChart3 size={16} />}
            title="Ranking de categorías"
            subtitle="Top 15 por unidades · transacciones y clientes en el detalle"
          />
          {categories.loading ? (
            <LoadingBlock height={300} />
          ) : categories.error ? (
            <ErrorBlock message={categories.error} onRetry={categories.reload} height={300} />
          ) : !categories.data?.items.length ? (
            <EmptyBlock height={300} />
          ) : (
            <HorizontalBars
              colors={CHART_COLORS}
              data={categories.data.items.slice(0, 15).map((c) => ({
                label: c.name,
                value: c.units,
                subtitle: `${formatNumber(c.transactions)} tx · ${formatNumber(c.customers)} clientes`,
                title: `${c.name} — ${formatNumber(c.units)} unidades · ${formatNumber(
                  c.transactions,
                )} transacciones · ${formatNumber(c.customers)} clientes`,
              }))}
            />
          )}
        </Card>
      </section>
    </div>
  );
}
