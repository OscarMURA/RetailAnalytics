"use client";

import { useCallback } from "react";
import { Package, Users, Calendar, Filter, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Card, CardHeader, Badge, KpiCard } from "@/components/ui";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/states";
import { HorizontalBars } from "@/components/charts/horizontal-bars";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { CategoriesDonut } from "@/components/charts/categories-donut";
import { useFetch } from "@/lib/use-fetch";
import { api } from "@/lib/api";
import { PALETTE, MONTHS_ES, formatNumber } from "@/lib/constants";

const WEEKDAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatPeakDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
}

export default function DashboardPage() {
  const kpis = useFetch(() => api.kpis(), []);
  const products = useFetch(() => api.topProducts(10), []);
  const customers = useFetch(() => api.topCustomers(10), []);
  const calendar = useFetch(() => api.calendar(90), []);
  const categories = useFetch(() => api.categories(), []);
  const coverage = useFetch(() => api.coverage(), []);

  const reloadAll = useCallback(() => {
    kpis.reload();
    products.reload();
    customers.reload();
    calendar.reload();
    categories.reload();
    coverage.reload();
  }, [kpis, products, customers, calendar, categories, coverage]);

  const trendPct = calendar.data?.trend30.pct ?? 0;
  const trendDir = calendar.data?.trend30.direction ?? "flat";
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  const trendColor =
    trendDir === "up" ? "text-emerald-700" : trendDir === "down" ? "text-red-700" : "text-slate-600";

  return (
    <div className="view-enter">
      <PageHeader
        eyebrow="Dashboard"
        title="Resumen ejecutivo"
        subtitle="Visión consolidada del comportamiento transaccional procesado con Apache Spark sobre Google Cloud Dataproc. Período activo: últimos 90 días."
        onRefresh={reloadAll}
      />

      {/* KPIs */}
      <section className="mb-6">
        {kpis.loading ? (
          <LoadingBlock height={140} />
        ) : kpis.error ? (
          <ErrorBlock message={kpis.error} onRetry={kpis.reload} height={140} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            {kpis.data?.kpis.map((k) => (
              <KpiCard key={k.key} kpi={k} />
            ))}
          </div>
        )}
      </section>

      {/* Top productos / clientes */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 mb-6">
        <Card>
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
        <Card>
          <CardHeader
            icon={<Users size={16} />}
            title="Top 10 clientes"
            subtitle="IDs anonimizados · ordenados por unidades adquiridas"
            right={<Badge tone="slate">por volumen</Badge>}
          />
          {customers.loading ? (
            <LoadingBlock />
          ) : customers.error ? (
            <ErrorBlock message={customers.error} onRetry={customers.reload} />
          ) : !customers.data?.length ? (
            <EmptyBlock />
          ) : (
            <HorizontalBars
              data={customers.data.map((c) => ({ label: c.id, value: c.units }))}
              color={PALETTE.teal500}
            />
          )}
        </Card>
      </section>

      {/* Calendar heatmap */}
      <section className="mb-6">
        <Card>
          <CardHeader
            icon={<Calendar size={16} />}
            title="Días pico de compra"
            subtitle="Intensidad transaccional · últimos 90 días"
          />
          {calendar.loading ? (
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
          )}
        </Card>
      </section>

      {/* Categorías donut + cobertura */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-2">
        <Card className="xl:col-span-2">
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
            <CategoriesDonut data={categories.data.items} activeCount={categories.data.activeCount} />
          )}
        </Card>
        <Card>
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
                  hint: "red completa",
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
    </div>
  );
}
